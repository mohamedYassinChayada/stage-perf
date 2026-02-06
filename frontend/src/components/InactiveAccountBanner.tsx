import React from 'react';
import './InactiveAccountBanner.css';

interface InactiveAccountBannerProps {
  approvalStatus?: string;
  rejectedReason?: string;
}

const InactiveAccountBanner: React.FC<InactiveAccountBannerProps> = ({ approvalStatus, rejectedReason }) => {
  if (!approvalStatus || approvalStatus === 'approved') return null;

  let message = '';
  let variant = 'warning';

  switch (approvalStatus) {
    case 'pending_verification':
      message = 'Please verify your email address to continue. Check your inbox for a verification code.';
      variant = 'info';
      break;
    case 'pending_approval':
      message = 'Your account is pending admin approval. Some features may be restricted.';
      variant = 'warning';
      break;
    case 'rejected':
      message = `Your account has been rejected.${rejectedReason ? ` Reason: ${rejectedReason}` : ''}`;
      variant = 'error';
      break;
    default:
      return null;
  }

  return (
    <div className={`inactive-account-banner banner-${variant}`}>
      <span className="banner-message">{message}</span>
    </div>
  );
};

export default InactiveAccountBanner;
