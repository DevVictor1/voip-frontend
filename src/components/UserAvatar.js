import { getInitials } from '../utils/avatar';

function UserAvatar({
  name = '',
  avatarUrl = '',
  className = '',
  imageClassName = '',
  initialsClassName = '',
  fallback = null,
}) {
  const classes = ['user-avatar', className].filter(Boolean).join(' ');

  return (
    <span className={classes} aria-hidden="true">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className={['user-avatar-image', imageClassName].filter(Boolean).join(' ')}
        />
      ) : fallback ? (
        fallback
      ) : (
        <span className={['user-avatar-initials', initialsClassName].filter(Boolean).join(' ')}>
          {getInitials(name)}
        </span>
      )}
    </span>
  );
}

export default UserAvatar;
