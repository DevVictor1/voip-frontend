export const chats = [
  {
    id: 'chat-1',
    name: 'Smith & Co. Dental',
    phone: '+1 (555) 213-8841',
    lastMessage: 'Hi, your appointment is confirmed for tomorrow at 2 PM.',
    time: '2:05 PM',
    unread: 2,
    status: 'Active',
    initials: 'SD'
  },
  {
    id: 'chat-2',
    name: 'Brightline Logistics',
    phone: '+1 (555) 430-9921',
    lastMessage: 'Your order is ready for pickup at the dock.',
    time: '1:47 PM',
    unread: 0,
    status: 'Active',
    initials: 'BL'
  },
  {
    id: 'chat-3',
    name: 'Harbor Legal Group',
    phone: '+1 (555) 301-6650',
    lastMessage: 'Thanks for reaching out, how can we help you today?',
    time: '12:16 PM',
    unread: 1,
    status: 'Monitoring',
    initials: 'HL'
  },
  {
    id: 'chat-4',
    name: 'Westbrook Realty',
    phone: '+1 (555) 277-9043',
    lastMessage: 'Please route new inquiries to the Atlanta, GA team.',
    time: '11:02 AM',
    unread: 0,
    status: 'Pending',
    initials: 'WR'
  },
  {
    id: 'chat-5',
    name: 'Crescent Health',
    phone: '+1 (555) 410-7789',
    lastMessage: 'We need the main line updated for the Los Angeles, CA office.',
    time: '03/23/2026',
    unread: 0,
    status: 'Resolved',
    initials: 'CH'
  }
];

export const messagesByChatId = {
  'chat-1': [
    {
      id: 'm1',
      direction: 'inbound',
      body: 'Hi, your appointment is confirmed for tomorrow at 2 PM. Please arrive 10 minutes early to check in.',
      time: '2:00 PM'
    },
    {
      id: 'm2',
      direction: 'outbound',
      body: 'Thanks, we have it on the calendar. Would you like a reminder sent one hour before?',
      time: '2:02 PM'
    },
    {
      id: 'm3',
      direction: 'inbound',
      body: 'Yes, please. A text reminder would be perfect.',
      time: '2:04 PM'
    }
  ],
  'chat-2': [
    {
      id: 'm4',
      direction: 'inbound',
      body: 'Your order is ready for pickup at the dock. The reference is BL-4821.',
      time: '1:45 PM'
    },
    {
      id: 'm5',
      direction: 'outbound',
      body: 'Great, we will have a driver there by 3:00 PM.',
      time: '1:46 PM'
    }
  ],
  'chat-3': [
    {
      id: 'm6',
      direction: 'inbound',
      body: 'Thanks for reaching out, how can we help you today?',
      time: '12:14 PM'
    },
    {
      id: 'm7',
      direction: 'outbound',
      body: 'We need to update our call routing for the New York, NY support queue.',
      time: '12:15 PM'
    }
  ],
  'chat-4': [
    {
      id: 'm8',
      direction: 'inbound',
      body: 'Please route new inquiries to the Atlanta, GA team starting 03/25/2026.',
      time: '11:02 AM'
    }
  ],
  'chat-5': [
    {
      id: 'm9',
      direction: 'inbound',
      body: 'We need the main line updated for the Los Angeles, CA office. The new number is +1 (555) 410-7789.',
      time: '03/23/2026'
    },
    {
      id: 'm10',
      direction: 'outbound',
      body: 'Noted. We will apply the change and confirm once the routing tests pass.',
      time: '03/23/2026'
    }
  ]
};

export const stats = [
  { label: 'Active Conversations', value: '128' },
  { label: 'Daily Call Minutes', value: '12.4k' },
  { label: 'SMS Delivered', value: '18.9k' },
  { label: 'Missed Calls', value: '21' }
];

export const users = [
  {
    id: 'u1',
    name: 'John Smith',
    role: 'Account Owner',
    email: 'john.smith@smithdental.com',
    status: 'Online'
  },
  {
    id: 'u2',
    name: 'Emily Johnson',
    role: 'Support Lead',
    email: 'emily.johnson@brightline.com',
    status: 'In call'
  },
  {
    id: 'u3',
    name: 'Michael Brown',
    role: 'Operations',
    email: 'michael.brown@harborlegal.com',
    status: 'Offline'
  },
  {
    id: 'u4',
    name: 'Sarah Williams',
    role: 'Customer Success',
    email: 'sarah.williams@westbrookrealty.com',
    status: 'Online'
  }
];
