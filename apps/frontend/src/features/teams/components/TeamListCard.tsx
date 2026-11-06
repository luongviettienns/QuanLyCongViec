import { Card, Space, Tag, Typography } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import type { Team } from '../types/team.types';

const { Text, Paragraph } = Typography;

interface TeamListCardProps {
  teams: Team[];
  selectedTeamId: number | null;
  currentUserId?: number;
  onSelectTeam: (teamId: number) => void;
}

export function TeamListCard({
  teams,
  selectedTeamId,
  currentUserId,
  onSelectTeam,
}: TeamListCardProps) {
  return (
    <Card
      title={
        <Space>
          <TeamOutlined />
          <span>Danh sách nhóm ({teams.length})</span>
        </Space>
      }
      style={{ borderRadius: 8 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {teams.map((t) => {
          const isSelected = t.id === selectedTeamId;
          const isTeamOwner = t.ownerId === currentUserId;
          const myMember = t.members?.find((m) => m.userId === currentUserId);
          const myRoleLabel = isTeamOwner
            ? 'Chủ nhóm'
            : myMember?.role === 'ADMIN'
              ? 'Quản trị viên'
              : 'Thành viên';
          const myRoleColor = isTeamOwner
            ? 'gold'
            : myMember?.role === 'ADMIN'
              ? 'blue'
              : 'default';

          return (
            <div
              key={t.id}
              onClick={() => onSelectTeam(t.id)}
              style={{
                padding: '12px 16px',
                borderRadius: 6,
                cursor: 'pointer',
                border: isSelected ? '1px solid #1677ff' : '1px solid #f0f0f0',
                backgroundColor: isSelected ? '#e6f4ff' : '#ffffff',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: 15, color: isSelected ? '#1677ff' : 'inherit' }}>
                  {t.name}
                </Text>
                <Tag color={myRoleColor}>{myRoleLabel}</Tag>
              </div>
              {t.description && (
                <Paragraph
                  type="secondary"
                  ellipsis={{ rows: 1 }}
                  style={{ margin: '4px 0 0 0', fontSize: 12 }}
                >
                  {t.description}
                </Paragraph>
              )}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                <span>{t._count?.members ?? t.members?.length ?? 1} thành viên</span>
                <span>{t._count?.tasks ?? 0} công việc</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
