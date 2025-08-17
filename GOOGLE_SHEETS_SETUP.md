# Google Sheets API Setup Guide

This guide will help you set up the Google Sheets API integration for your Spend Tracking App.

## Prerequisites

- A Google account
- A Google Cloud Project
- Basic familiarity with Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top of the page
3. Click "New Project"
4. Enter a project name (e.g., "Spend Tracking App")
5. Click "Create"

## Step 2: Enable Google Sheets API

1. In your new project, go to the [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for "Google Sheets API"
3. Click on "Google Sheets API"
4. Click "Enable"

## Step 3: Create a Service Account

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - **Name**: `spend-tracking-app`
   - **Description**: `Service account for Spend Tracking App`
4. Click "Create and Continue"
5. Skip the optional steps and click "Done"

## Step 4: Generate Service Account Key

1. In the credentials list, find your service account and click on it
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose "JSON" format
5. Click "Create"
6. The JSON file will download automatically - keep this safe!

## Step 5: Configure Environment Variables

1. Copy `backend/env.example` to `backend/.env`
2. Open `backend/.env` and update the following values:

```bash
# Get these from your service account JSON file
GOOGLE_SHEETS_CREDENTIALS_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR PRIVATE KEY\n-----END PRIVATE KEY-----\n"

# Your Google Sheets ID (from the URL)
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here
```

**Important**: The private key should be the entire key including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` parts.

## Step 6: Set Up Your Google Sheets

1. Create a new Google Sheets document or use an existing one
2. Create two sheets:
   - **Transactions** - for storing transaction data
   - **Categories** - for storing category information

### Transactions Sheet Structure

| A (ID) | B (Date) | C (Amount) | D (Type) | E (Category) | F (Description) | G (Created At) | H (Updated At) |
|--------|----------|------------|----------|--------------|-----------------|----------------|----------------|
| Header | Header   | Header     | Header   | Header       | Header          | Header         | Header         |
| auto   | 2024-01-15 | 50.00    | expense | Grocery      | Weekly groceries | 2024-01-15... | 2024-01-15... |

### Categories Sheet Structure

| A (ID) | B (Name) | C (Type) | D (Color) | E (Icon) |
|--------|----------|----------|-----------|----------|
| Header | Header   | Header   | Header    | Header   |
| cat-1  | Grocery  | expense  | #10B981   | 🛒       |

## Step 7: Share Your Sheets

1. In your Google Sheets document, click the "Share" button
2. Add your service account email (from the JSON file) as an editor
3. Make sure to give it "Editor" permissions
4. Click "Send" (no need to send an email)

## Step 8: Update Environment Variables

Update your `backend/.env` file with the correct ranges:

```bash
GOOGLE_SHEETS_TRANSACTIONS_RANGE=Transactions!A:H
GOOGLE_SHEETS_CATEGORIES_RANGE=Categories!A:E
```

## Step 9: Test the Integration

1. Start your application: `npm run dev`
2. Try adding a transaction through the app
3. Check your Google Sheets to see if the data appears

## Troubleshooting

### Common Issues

1. **"Invalid private key" error**
   - Make sure the private key includes the BEGIN/END markers
   - Ensure there are no extra spaces or line breaks

2. **"Access denied" error**
   - Verify the service account email has editor access to your sheets
   - Check that the spreadsheet ID is correct

3. **"API not enabled" error**
   - Make sure Google Sheets API is enabled in your Google Cloud project

4. **"Invalid range" error**
   - Check that your sheet names match exactly (case-sensitive)
   - Verify the range format is correct (e.g., "SheetName!A:H")

### Getting Your Spreadsheet ID

The spreadsheet ID is in the URL when you open your Google Sheets:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```

### Service Account Email Format

Service account emails follow this pattern:
```
service-account-name@project-id.iam.gserviceaccount.com
```

## Security Notes

- Never commit your `.env` file to version control
- Keep your service account JSON file secure
- Consider using environment variables in production
- The service account only has access to the specific sheets you share

## Next Steps

Once your Google Sheets integration is working:

1. Add some sample transactions to test the app
2. Explore the analytics and insights features
3. Customize categories and colors to match your preferences
4. Set up regular backups of your Google Sheets data

## Support

If you encounter issues:

1. Check the browser console for error messages
2. Verify all environment variables are set correctly
3. Ensure your Google Sheets structure matches the expected format
4. Check that the service account has proper permissions
