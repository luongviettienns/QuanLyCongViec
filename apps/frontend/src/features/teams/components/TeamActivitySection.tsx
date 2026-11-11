import { useState, useEffect, useCallback } from 'react';
import { List, Typography, Tag, Spin, Empty, Space } from 'antd';
import {
  UserAddOutlined,
  UserDeleteOutlined,
  SwapOutlined,
  CrownOutlined,
  LogoutOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { getTeamActivityLogs } from '../api/teams.api';
import type { TeamActivityLog } from '../types/team.types';

const { Text } = Typography;

interface TeamActivitySectionProps {
  teamId: number;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes}, ${day}/${month}/${year}`;
  } catch {
    return isoString;
  }
}

export function TeamActivitySection({ teamId }: TeamActivitySectionProps) {
  const [logs, setLogs] = useState<TeamActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const data = await getTeamActivityLogs(teamId, signal);
        setLogs(data);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLogs([]);
      } finally {
        setLoading(false);
      }
    },
    [teamId],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function init() {
      await Promise.resolve();
      if (!active) return;
      await loadLogs(controller.signal);
    }
    void init();
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadLogs]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Chưa có lịch sử hoạt động thành viên"
      />
    );
  }

  return (
    <List
      itemLayout="horizontal"
      dataSource={logs}
      renderItem={(log) => {
        const actorName = log.actor?.name || 'Hệ thống';
        const targetName = log.targetUser?.name || 'Thành viên';

        let icon = <HistoryOutlined style={{ color: '#1890ff', fontSize: 18 }} />;
        let titleNode = null;
        let detailNode = null;

        const metadataParts: string[] = [];
        if (log.metadata?.unassignedTaskCount && log.metadata.unassignedTaskCount > 0) {
          metadataParts.push(`Hủy phân công ${log.metadata.unassignedTaskCount} Task`);
        }
        if (log.metadata?.affectedSubtaskCount && log.metadata.affectedSubtaskCount > 0) {
          metadataParts.push(`${log.metadata.affectedSubtaskCount} Subtask`);
        }
        if (log.metadata?.revokedCollaboratorCount && log.metadata.revokedCollaboratorCount > 0) {
          metadataParts.push(`Thu hồi ${log.metadata.revokedCollaboratorCount} lời mời phối hợp`);
        }
        const metadataDesc = metadataParts.length > 0 ? metadataParts.join(' và ') : null;

        switch (log.action) {
          case 'ADD_MEMBER':
            icon = <UserAddOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
            titleNode = (
              <span>
                <Text strong>{actorName}</Text> đã thêm <Text strong>{targetName}</Text> vào nhóm
              </span>
            );
            detailNode = (
              <Space orientation="horizontal" size="small">
                <span>
                  Vai trò: <Tag color={log.newRole === 'ADMIN' ? 'blue' : 'green'}>{log.newRole ?? 'MEMBER'}</Tag>
                </span>
                <span>·</span>
                <span>{formatDate(log.createdAt)}</span>
              </Space>
            );
            break;

          case 'CHANGE_ROLE':
            icon = <SwapOutlined style={{ color: '#fa8c16', fontSize: 18 }} />;
            titleNode = (
              <span>
                <Text strong>{actorName}</Text> đã cấp quyền <Tag color={log.newRole === 'ADMIN' ? 'blue' : 'green'}>{log.newRole}</Tag> cho <Text strong>{targetName}</Text>
              </span>
            );
            detailNode = (
              <Space orientation="horizontal" size="small">
                <span>{log.oldRole ?? 'MEMBER'} → {log.newRole ?? 'ADMIN'}</span>
                <span>·</span>
                <span>{formatDate(log.createdAt)}</span>
              </Space>
            );
            break;

          case 'REMOVE_MEMBER':
            icon = <UserDeleteOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />;
            titleNode = (
              <span>
                <Text strong>{actorName}</Text> đã xóa <Text strong>{targetName}</Text> khỏi nhóm
              </span>
            );
            detailNode = (
              <Space orientation="horizontal" size="small">
                {metadataDesc && <span>{metadataDesc} ·</span>}
                <span>{formatDate(log.createdAt)}</span>
              </Space>
            );
            break;

          case 'LEAVE_TEAM':
            icon = <LogoutOutlined style={{ color: '#8c8c8c', fontSize: 18 }} />;
            titleNode = (
              <span>
                <Text strong>{targetName}</Text> đã tự rời khỏi nhóm
              </span>
            );
            detailNode = (
              <Space orientation="horizontal" size="small">
                {metadataDesc && <span>{metadataDesc} ·</span>}
                <span>{formatDate(log.createdAt)}</span>
              </Space>
            );
            break;

          case 'TRANSFER_OWNER':
            icon = <CrownOutlined style={{ color: '#faad14', fontSize: 18 }} />;
            titleNode = (
              <span>
                <Text strong>{actorName}</Text> đã chuyển quyền Owner cho <Text strong>{targetName}</Text>
              </span>
            );
            detailNode = <span>{formatDate(log.createdAt)}</span>;
            break;
        }

        return (
          <List.Item style={{ padding: '12px 0' }}>
            <List.Item.Meta
              avatar={<div style={{ paddingTop: 4 }}>{icon}</div>}
              title={titleNode}
              description={<Text type="secondary" style={{ fontSize: 12 }}>{detailNode}</Text>}
            />
          </List.Item>
        );
      }}
    />
  );
}
