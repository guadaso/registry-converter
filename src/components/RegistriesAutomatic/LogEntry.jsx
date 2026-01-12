// src/components/RegistriesAutomatic/LogEntry.jsx

export const LogEntry = ({ log }) => {
  let bgColor = '#f0f0f0';
  let color = '#333';
  if (log.type === 'error') {
    bgColor = '#ffebee';
    color = '#c62828';
  } else if (log.type === 'warning') {
    bgColor = '#fff8e1';
    color = '#ff8f00';
  } else if (log.type === 'success') {
    bgColor = '#e8f5e9';
    color = '#2e7d32';
  }
  return (
    <div style={{
      padding: '6px 10px',
      margin: '2px 0',
      borderRadius: '4px',
      backgroundColor: bgColor,
      color,
      fontSize: '13px',
      fontFamily: 'monospace'
    }}>
      [{log.timestamp}] {log.message}
    </div>
  );
};