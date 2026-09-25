import React, { useEffect, useState } from 'react';
import { platformGovernanceApi, PlatformProfile } from '../api/platform-governance.api';
import { DetailItem, DetailList, ErrorBanner, Panel, Value } from '../components/DetailList';
import { StatusBadge } from '../components/StatusBadge';
import { humanize } from '../format';
import { hashRoute } from '../hash-route';
import { Timestamp } from './UserTable';

/** The signed-in operator's own platform account. */
export const ProfileView: React.FC = () => {
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformGovernanceApi
      .profile()
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your profile.'));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!profile) return <div role="status" className="h-24 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none"><span className="sr-only">Loading</span></div>;

  return (
    <Panel
      title="Your platform account"
      description="Platform accounts are created by an operator with server access; details are changed there too."
      actions={
        <a href={hashRoute('account-security')} className="text-xs font-bold text-hq-link hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded">
          Password and two-factor
        </a>
      }
    >
      <DetailList>
        <DetailItem label="Name"><Value value={profile.display_name} /></DetailItem>
        <DetailItem label="Email">{profile.email}</DetailItem>
        <DetailItem label="Role">{humanize(profile.role)}</DetailItem>
        <DetailItem label="Status"><StatusBadge status={profile.is_active ? 'ACTIVE' : 'DISABLED'} /></DetailItem>
        <DetailItem label="Last sign-in"><Timestamp value={profile.last_login_at} empty="Never" /></DetailItem>
        <DetailItem label="Account ID"><Value value={profile.id} mono /></DetailItem>
      </DetailList>
    </Panel>
  );
};
