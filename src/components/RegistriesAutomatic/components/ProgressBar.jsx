export const ProgressBar = ({ value, label }) => (
  <div className="progress-container" style={{ marginTop: '10px' }}>
    <div className="progress-bar" style={{ height: '10px', backgroundColor: '#e0e0e0', borderRadius: '5px', overflow: 'hidden' }}>
      <div
        className="progress-fill"
        style={{
          width: `${value}%`,
          height: '100%',
          background: value === 100 ? '#4CAF50' : '#ba68c8',
          transition: 'width 0.3s'
        }}
      />
    </div>
    <div className="progress-label" style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
      {label}: {value}%
    </div>
  </div>
);