interface EmptyStateProps {
  message: string;
  hint?: string;
}

export function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <div className="empty-message">{message}</div>
      {hint && <div className="empty-hint">{hint}</div>}
    </div>
  );
}
