# FieldWorkBook - Team Expense Management System

A fully responsive web application for managing teams and their expense usage in the field. Built with modern web technologies and designed for two user roles: Admin and Field Staff.

![FieldWorkBook](https://img.shields.io/badge/FieldWorkBook-v1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node.js](https://img.shields.io/badge/Node.js-v16+-brightgreen)
![Express](https://img.shields.io/badge/Express-v4.18+-red)

## 🚀 Features

### Admin Features
- **Dashboard Overview**: View comprehensive statistics and team performance
- **Team Management**: Create teams based on location/city and assign initial budgets
- **User Management**: Add field staff members to teams
- **Expense Monitoring**: View detailed expenses by team and individual members
- **File Downloads**: Download expense attachments and receipts
- **Request Approval**: Approve or reject additional amount requests from field staff
- **Aggregate Data**: View initial amounts, used amounts, and remaining balances per team

### Field Staff Features
- **Personal Dashboard**: View team information and budget status
- **Expense Tracking**: Add expense entries with descriptions, amounts, and attachments
- **Receipt Upload**: Upload images of bills and receipts
- **Expense History**: View personal and team expense history
- **Amount Requests**: Request additional budget from admin with justification
- **Real-time Balance**: See current team balance and usage

### Technical Features
- **Responsive Design**: Works seamlessly on mobile, tablet, and desktop
- **Modern UI**: Beautiful interface with Bootstrap 5 and custom CSS
- **Smooth Animations**: CSS animations and Animate.css integration
- **Data Tables**: Interactive tables with sorting, searching, and pagination
- **File Upload**: Secure image upload with validation
- **Session Management**: Secure authentication system
- **RESTful API**: Clean API design with proper error handling

## 🛠️ Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **SQLite3** - Database
- **Multer** - File upload handling
- **bcrypt** - Password hashing
- **express-session** - Session management

### Frontend
- **HTML5** - Markup
- **CSS3** - Styling with custom properties and animations
- **JavaScript (ES6+)** - Application logic
- **Bootstrap 5** - UI framework
- **Font Awesome** - Icons
- **DataTables** - Enhanced table functionality
- **SweetAlert2** - Beautiful alerts and modals
- **Animate.css** - CSS animations

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- npm (v8 or higher)

### Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd FieldWorkBook
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create uploads directory**
   ```bash
   mkdir uploads
   ```

4. **Start the application**
   ```bash
   # Development mode (with auto-restart)
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## 🔐 Default Login Credentials

### Admin Account
- **Username**: `admin`
- **Password**: `admin123`

### Field Staff Accounts
Field staff accounts need to be created by the admin through the web interface.

## 📁 Project Structure

```
FieldWorkBook/
├── server.js                 # Main server file
├── package.json             # Dependencies and scripts
├── README.md               # Project documentation
├── fieldworkbook.db        # SQLite database (auto-created)
├── uploads/                # Uploaded files directory
└── public/                 # Frontend files
    ├── index.html          # Main HTML file
    ├── css/
    │   └── style.css       # Custom styles
    └── js/
        └── app.js          # Frontend JavaScript
```

## 🗄️ Database Schema

### Users Table
- `id` - Primary key
- `username` - Unique username
- `password` - Hashed password
- `role` - 'admin' or 'field_staff'
- `full_name` - User's full name
- `team_id` - Foreign key to teams table
- `created_at` - Timestamp

### Teams Table
- `id` - Primary key
- `name` - Team name
- `location` - Team location/city
- `initial_amount` - Initial budget assigned
- `used_amount` - Total amount used
- `remaining_amount` - Remaining balance
- `created_at` - Timestamp

### Expenses Table
- `id` - Primary key
- `team_id` - Foreign key to teams
- `user_id` - Foreign key to users
- `description` - Expense description
- `amount` - Expense amount
- `attachment_path` - Path to uploaded file
- `created_at` - Timestamp

### Amount Requests Table
- `id` - Primary key
- `team_id` - Foreign key to teams
- `user_id` - Foreign key to users
- `requested_amount` - Amount requested
- `reason` - Justification for request
- `status` - 'pending', 'approved', or 'rejected'
- `created_at` - Request timestamp
- `processed_at` - Processing timestamp

## 🔧 API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/auth/check` - Check authentication status

### Teams
- `GET /api/teams` - Get all teams (admin only)
- `POST /api/teams` - Create new team (admin only)
- `GET /api/teams/:id` - Get team details
- `GET /api/teams/:id/members` - Get team members (admin only)

### Users
- `POST /api/users` - Create new user (admin only)

### Expenses
- `GET /api/expenses` - Get expenses (filtered by role)
- `POST /api/expenses` - Add new expense (field staff only)

### Amount Requests
- `GET /api/amount-requests` - Get amount requests
- `POST /api/amount-requests` - Create amount request (field staff only)
- `PUT /api/amount-requests/:id/approve` - Approve request (admin only)
- `PUT /api/amount-requests/:id/reject` - Reject request (admin only)

### File Operations
- `GET /api/download/:filename` - Download attachment

## 🎨 UI Features

### Responsive Design
- Mobile-first approach
- Optimized for all screen sizes
- Touch-friendly interface
- Collapsible navigation

### Animations
- Smooth page transitions
- Loading animations
- Hover effects
- Form validation feedback

### User Experience
- Intuitive navigation
- Real-time feedback
- Confirmation dialogs
- Toast notifications
- Loading indicators

## 🔒 Security Features

- Password hashing with bcrypt
- Session-based authentication
- Role-based access control
- File upload validation
- SQL injection prevention
- XSS protection

## 🚀 Deployment

### Production Setup

1. **Environment Variables** (optional)
   ```bash
   export NODE_ENV=production
   export PORT=3000
   ```

2. **Database Backup**
   ```bash
   # Backup SQLite database
   cp fieldworkbook.db fieldworkbook.db.backup
   ```

3. **Process Management** (recommended)
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start server.js --name "fieldworkbook"
   pm2 startup
   pm2 save
   ```

### Docker Deployment (Optional)

Create a `Dockerfile`:
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t fieldworkbook .
docker run -p 3000:3000 -v $(pwd)/uploads:/app/uploads fieldworkbook
```

## 📱 Mobile Support

The application is fully responsive and optimized for mobile devices:
- Touch-friendly buttons and forms
- Optimized table layouts
- Responsive navigation
- Mobile-optimized file uploads
- Swipe gestures support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📋 TODO / Future Enhancements

- [ ] Export data to Excel/PDF
- [ ] Email notifications for requests
- [ ] Advanced reporting and analytics
- [ ] Multi-currency support
- [ ] Bulk expense import
- [ ] Mobile app development
- [ ] Integration with accounting systems
- [ ] Advanced user permissions
- [ ] Expense categories and tags
- [ ] Budget forecasting

## 🐛 Known Issues

- File upload limited to images only
- Single session per user
- No email verification for new accounts

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

Created with ❤️ for efficient team expense management.

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the API endpoints

---

**FieldWorkBook** - Making team expense management simple and efficient! 🚀
