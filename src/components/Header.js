function Header({ title, subtitle, status }) {
  return (
    <div className="header">
      <div className="header-title">
        <div>
          <h3>{title}</h3>
          {subtitle ? <div className="header-meta">{subtitle}</div> : null}
        </div>
        {status ? <span className="status-pill">{status}</span> : null}
      </div>
      <div className="header-actions">
        <button className="button-icon" type="button">
          Assign
        </button>
        <button className="button-icon" type="button">
          Notes
        </button>
        <button className="button-icon" type="button">
          Options
        </button>
      </div>
    </div>
  );
}

export default Header;
