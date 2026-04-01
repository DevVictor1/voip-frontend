function Header({ title, subtitle, status, actions, badge, meta }) {
  return (
    <div className="header">
      <div className="header-title">
        <div className="header-title-text">
          <div className="header-title-main">
            <h3>{title}</h3>
            {badge}
          </div>
          {subtitle ? <div className="header-meta">{subtitle}</div> : null}
          {meta ? <div className="header-meta header-meta-strong">{meta}</div> : null}
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
        {actions}
      </div>
    </div>
  );
}

export default Header;
