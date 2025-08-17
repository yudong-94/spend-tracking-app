# Spend Tracking App

A comprehensive financial tracking application that integrates with Google Sheets to provide insights into your income, expenses, and cash flow patterns.

## Features

- 📊 **Real-time Google Sheets Integration**: Sync data directly with your existing spreadsheet
- 💰 **Simple Data Entry**: Easy-to-use interface for recording income and expenses
- 📈 **Comprehensive Analytics**: 
  - Monthly income/expense trends
  - Category breakdown analysis
  - Net cash flow tracking
  - Period-based filtering
  - Interactive charts and visualizations
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Charts**: Chart.js with React wrappers
- **Styling**: Tailwind CSS
- **Google Integration**: Google Sheets API v4

## Project Structure

```
spend_tracking_app/
├── frontend/          # React frontend application
├── backend/           # Node.js API server
├── shared/            # Shared types and utilities
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- Google Cloud Project with Sheets API enabled
- Google Service Account credentials

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm run install:all
   ```

3. Set up Google Sheets API:
   - Create a Google Cloud Project
   - Enable Google Sheets API
   - Create a service account and download credentials
   - Share your spreadsheet with the service account email

4. Configure environment variables:
   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your Google credentials
   ```

5. Start development servers:
   ```bash
   npm run dev
   ```

The app will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Usage

1. **Add Transactions**: Use the simple form to record new income or expenses
2. **View Dashboard**: See your current month's financial overview
3. **Analyze Trends**: Explore monthly patterns and category breakdowns
4. **Filter Data**: Select specific time periods or categories for detailed analysis

## Contributing

This is a personal project, but feel free to suggest improvements or report issues!

## License

MIT
