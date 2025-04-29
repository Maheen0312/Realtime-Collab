import React from 'react';
import Avatar from 'react-avatar';

const UserList = ({ clients }) => {
  return (
    <div className="users-list">
      {clients.map((client) => (
        <div key={client.socketId} className="user-item">
          <div className="user-avatar">
            <Avatar
              name={client.username}
              size={32}
              round="14px"
            />
          </div>
          <span className="user-name">{client.username}</span>
        </div>
      ))}
    </div>
  );
};

export default UserList;