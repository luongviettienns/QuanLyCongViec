import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  API_BASE_URL,
  getFriendlyErrorMessage,
  isAbortError,
  isUnauthorizedError,
} from '../../../shared/api';
import { createMcpToken, listMcpTokens, revokeMcpToken } from '../api/mcp.api';
import type { McpTokenRecord } from '../types/mcp.types';
import {
  buildMcpClientConfigSnippet,
  buildMcpEndpointUrl,
  formatMcpTokenStatus,
  isMcpTokenActive,
} from '../utils/mcp-config.utils';

const { Text } = Typography;

interface CreateTokenFormValues {
  name: string;
  expiresInDays?: number;
}

interface McpTokensTabProps {
  active: boolean;
  onBusyChange?: (busy: boolean) => void;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Chưa có';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Chưa có';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function copyToClipboard(text: string, successLabel: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      message.success(successLabel);
      return;
    }
  } catch {
    // Fall through to legacy textarea copy for non-HTTPS LAN origins
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (ok) {
      message.success(successLabel);
      return;
    }
  } catch {
    // Ignore and show fallback message below
  }

  message.error('Trình duyệt không cho phép sao chép tự động, vui lòng bôi đen để copy.');
}

export default function McpTokensTab({ active, onBusyChange }: McpTokensTabProps) {
  const [form] = Form.useForm<CreateTokenFormValues>();
  const [tokens, setTokens] = useState<McpTokenRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revealedToken, setRevealedToken] = useState<{ id: number; token: string } | null>(null);
  const [prevActive, setPrevActive] = useState(active);
  const abortRef = useRef<AbortController | null>(null);
  const mutatingRef = useRef(false);

  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) {
      setRevealedToken(null);
      setLoadError(null);
    }
  }

  const isMutating = creating || revokingId !== null;

  useEffect(() => {
    onBusyChange?.(isMutating);
    return () => {
      onBusyChange?.(false);
    };
  }, [isMutating, onBusyChange]);

  const endpointUrl = useMemo(
    () =>
      buildMcpEndpointUrl({
        apiBaseUrl: API_BASE_URL,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      }),
    [],
  );

  const loadTokens = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listMcpTokens(controller.signal);
      if (abortRef.current === controller) {
        setTokens(data);
        setLoadError(null);
      }
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        return;
      }
      if (abortRef.current === controller) {
        const msg = getFriendlyErrorMessage(error, 'Không thể tải danh sách API token MCP');
        setLoadError(msg);
        message.error(msg);
      }
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!active) {
      abortRef.current?.abort();
      return;
    }
    let mounted = true;
    const sync = async () => {
      await Promise.resolve();
      if (mounted) {
        await loadTokens();
      }
    };
    void sync();
    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
  }, [active, loadTokens]);

  async function handleCreateToken(values: CreateTokenFormValues) {
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    abortRef.current?.abort();
    try {
      setCreating(true);
      const res = await createMcpToken({
        name: values.name.trim(),
        expiresInDays: values.expiresInDays && values.expiresInDays > 0 ? values.expiresInDays : null,
      });
      setRevealedToken({ id: res.record.id, token: res.token });
      setTokens((prev) => [res.record, ...prev]);
      setLoadError(null);
      form.resetFields();
      message.success('Đã tạo API token MCP chỉ đọc');
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        return;
      }
      message.error(getFriendlyErrorMessage(error, 'Không thể tạo API token MCP'));
    } finally {
      setCreating(false);
      mutatingRef.current = false;
    }
  }

  async function handleRevokeToken(tokenId: number) {
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    abortRef.current?.abort();
    try {
      setRevokingId(tokenId);
      const updated = await revokeMcpToken(tokenId);
      setTokens((prev) => prev.map((t) => (t.id === tokenId ? updated : t)));
      setRevealedToken((prev) => (prev && prev.id === tokenId ? null : prev));
      message.success('Đã thu hồi API token MCP');
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        return;
      }
      message.error(getFriendlyErrorMessage(error, 'Không thể thu hồi API token MCP'));
    } finally {
      setRevokingId(null);
      mutatingRef.current = false;
    }
  }

  const configSnippet = useMemo(
    () => buildMcpClientConfigSnippet(endpointUrl, revealedToken?.token),
    [endpointUrl, revealedToken],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="mcp-tokens-tab">
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 8,
          background: '#f6ffed',
          border: '1px solid #b7eb8f',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <SafetyCertificateOutlined
          aria-hidden="true"
          style={{ color: '#52c41a', fontSize: 16, marginTop: 2 }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1f1f1f' }}>
            MCP Server chỉ đọc (Read-Only)
          </div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
            Cho phép AI client (Antigravity, Cursor, Claude Desktop...) đọc công việc, thống kê,
            nhóm, danh mục và thông báo của bạn theo đúng quyền RBAC. Không cho phép sửa/xóa dữ liệu.
          </Text>
          <div
            style={{
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <code
              style={{
                fontSize: 11.5,
                background: '#ffffff',
                border: '1px solid #d9f7be',
                padding: '2px 6px',
                borderRadius: 4,
                wordBreak: 'break-all',
              }}
              data-testid="mcp-endpoint-url"
            >
              {endpointUrl}
            </code>
            <Button
              size="small"
              type="link"
              icon={<CopyOutlined aria-hidden="true" />}
              onClick={() => void copyToClipboard(endpointUrl, 'Đã sao chép URL MCP Server')}
              style={{ padding: '0 4px', height: 22, fontSize: 12 }}
            >
              Sao chép URL
            </Button>
          </div>
        </div>
      </div>

      {/* Create Read-Only Token Form */}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ expiresInDays: 90 }}
        onFinish={(values) => void handleCreateToken(values)}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <Form.Item
            name="name"
            label="Tạo API Token mới (chỉ đọc)"
            style={{ flex: '1 1 210px', marginBottom: 8 }}
            rules={[
              { required: true, message: 'Vui lòng nhập tên gợi nhớ' },
              {
                validator: (_, value: string) => {
                  const trimmed = (value ?? '').trim();
                  if (trimmed.length < 2) {
                    return Promise.reject(new Error('Tên token phải có ít nhất 2 ký tự'));
                  }
                  if (trimmed.length > 60) {
                    return Promise.reject(new Error('Tên token tối đa 60 ký tự'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input
              prefix={<KeyOutlined aria-hidden="true" style={{ color: '#bfbfbf' }} />}
              placeholder="Ví dụ: Cursor Laptop, Claude Desktop..."
              maxLength={60}
              disabled={isMutating}
              data-testid="mcp-token-name-input"
            />
          </Form.Item>

          <Form.Item
            name="expiresInDays"
            label="Thời hạn"
            style={{ width: 135, marginBottom: 8 }}
          >
            <Select
              aria-label="Chọn thời hạn token MCP"
              disabled={isMutating}
              options={[
                { value: 7, label: '7 ngày' },
                { value: 30, label: '30 ngày' },
                { value: 90, label: '90 ngày' },
                { value: 365, label: '1 năm' },
                { value: 0, label: 'Không hết hạn' },
              ]}
            />
          </Form.Item>

          <div style={{ marginBottom: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlusOutlined aria-hidden="true" />}
              loading={creating}
              disabled={isMutating}
              data-testid="mcp-token-create-btn"
            >
              Tạo token
            </Button>
          </div>
        </div>
      </Form>

      {/* One-time token reveal + copyable JSON snippet */}
      {revealedToken && (
        <Alert
          type="warning"
          showIcon
          data-testid="mcp-token-reveal-alert"
          title="Lưu lại token ngay — chỉ hiển thị một lần duy nhất"
          description={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <code
                  data-testid="mcp-revealed-token"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: '#ffffff',
                    border: '1px solid #ffe58f',
                    fontSize: 12,
                    wordBreak: 'break-all',
                  }}
                >
                  {revealedToken.token}
                </code>
                <Button
                  size="small"
                  type="primary"
                  icon={<CopyOutlined aria-hidden="true" />}
                  onClick={() => void copyToClipboard(revealedToken.token, 'Đã sao chép API token')}
                >
                  Copy Token
                </Button>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <Text type="secondary" style={{ fontSize: 11.5 }}>
                  Cấu hình nhanh cho MCP Client (JSON):
                </Text>
                <Button
                  size="small"
                  icon={<CopyOutlined aria-hidden="true" />}
                  onClick={() => void copyToClipboard(configSnippet, 'Đã sao chép JSON cấu hình MCP')}
                  data-testid="mcp-copy-json-btn"
                >
                  Copy JSON
                </Button>
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: 8,
                  borderRadius: 6,
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: 11,
                  overflowX: 'auto',
                  maxWidth: '100%',
                }}
              >
                {configSnippet}
              </pre>
            </div>
          }
        />
      )}

      {/* Token list */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <Text strong style={{ fontSize: 13 }}>
            Danh sách API Token ({tokens.length})
          </Text>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Spin size="small" />
          </div>
        ) : loadError && tokens.length === 0 ? (
          <Alert
            type="error"
            showIcon
            title={loadError}
            action={
              <Button
                size="small"
                icon={<ReloadOutlined aria-hidden="true" />}
                onClick={() => void loadTokens()}
              >
                Thử lại
              </Button>
            }
          />
        ) : tokens.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có API token MCP nào"
            style={{ margin: '12px 0' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 240,
              overflowY: 'auto',
            }}
            data-testid="mcp-token-list"
          >
            {tokens.map((item) => {
              const status = formatMcpTokenStatus(item);
              const activeToken = isMcpTokenActive(item);
              return (
                <div
                  key={item.id}
                  data-testid={`mcp-token-row-${item.id}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #f0f0f0',
                    background: activeToken ? '#ffffff' : '#fafafa',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text strong style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
                        {item.name}
                      </Text>
                      <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                        Chỉ đọc
                      </Tag>
                      <Tag color={status.color} style={{ margin: 0, fontSize: 11 }}>
                        {status.label}
                      </Tag>
                    </div>
                    <Space size={10} wrap style={{ marginTop: 4, fontSize: 11.5, color: '#8c8c8c' }}>
                      <code>{item.tokenPrefix}...</code>
                      <span>Dùng gần nhất: {formatDateTime(item.lastUsedAt)}</span>
                      <span>
                        Hết hạn: {item.expiresAt ? formatDateTime(item.expiresAt) : 'Không giới hạn'}
                      </span>
                    </Space>
                  </div>

                  {!item.revokedAt && (
                    <Popconfirm
                      title="Thu hồi API token này?"
                      description="Các MCP client đang dùng token này sẽ mất quyền truy cập ngay lập tức."
                      okText="Thu hồi"
                      cancelText="Huỷ"
                      okButtonProps={{ danger: true }}
                      disabled={isMutating}
                      onConfirm={() => void handleRevokeToken(item.id)}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined aria-hidden="true" />}
                        loading={revokingId === item.id}
                        disabled={isMutating && revokingId !== item.id}
                        data-testid={`mcp-token-revoke-${item.id}`}
                      >
                        Thu hồi
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
