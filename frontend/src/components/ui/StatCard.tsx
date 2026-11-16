import { type ReactNode } from 'react';
import { Badge, type BadgeTone } from './Badge';
import { Card, CardBody } from './Card';
import { Icon, type IconName } from './Icon';

interface StatCardProps {
  value: ReactNode;
  label: ReactNode;
  icon: IconName;
  badge?: { text: string; tone: BadgeTone };
}

// AdminMart dashboard first-row card: h2 number + pill badge, muted h6 label, faded icon on the right.
export function StatCard({ value, label, icon, badge }: StatCardProps) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center md:block lg:flex">
          <div className="min-w-0">
            <div className="inline-flex items-center">
              <h2 className="mb-1 text-[30px] font-medium text-dark">{value}</h2>
              {badge && (
                <Badge tone={badge.tone} pill className="ml-2 md:hidden lg:inline-flex">
                  {badge.text}
                </Badge>
              )}
            </div>
            <h6 className="mb-0 w-full truncate text-sm font-normal text-muted">{label}</h6>
          </div>
          <div className="ml-auto text-muted opacity-70 md:mt-3 lg:mt-0">
            <Icon name={icon} size={24} />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
