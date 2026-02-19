# Bill Tracker

A full-stack web application for tracking and analyzing your bills using AI-powered extraction.

## Features

- **AI Bill Extraction**: Upload bill images and automatically extract vendor, category, date, and amount using Anthropic's vision API
- **Manual Editing**: Review and edit extracted data before saving
- **Expense Tracking**: View all saved bills in a sortable table
- **Insights Dashboard**:
  - Total spending this month and year
  - Top spending category
  - Spending breakdown by category (bar chart)
  - Monthly spending trend (line chart)
- **CSV Export**: Download all bills as a CSV file

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3, Chart.js
- **Backend**: Python FastAPI
- **Database**: SQLite
- **AI**: NVIDIA API with Kimi K2.5 vision model

## Setup Instructions

### 1. Configure Environment Variables

Create a `.env` file in the root directory (or edit the existing one):

```
NVIDIA_API_KEY=your_nvidia_api_key_here
```

Get your API key from [NVIDIA Build](https://build.nvidia.com/moonshotai/kimi-k2.5) and replace `your_nvidia_api_key_here` with it.

### 2. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 3. Start the Backend Server

```bash
cd backend
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

### 4. Open the Frontend

Open `frontend/index.html` in your browser, or use the Live Server extension in VS Code.

## Project Structure

```
bill-tracker/
├── backend/
│   ├── main.py            # FastAPI app with all routes
│   ├── database.py        # SQLite setup and queries
│   ├── extractor.py       # NVIDIA Kimi K2.5 vision API logic
│   ├── requirements.txt
│   └── uploads/           # Stored bill images
├── frontend/
│   ├── index.html         # Single page app
│   ├── style.css          # Styles
│   └── app.js             # Frontend logic
├── .env                   # Environment variables
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload bill image and extract data |
| POST | `/bills` | Save a bill to database |
| GET | `/bills` | Get all bills |
| DELETE | `/bills/{id}` | Delete a bill |
| GET | `/insights` | Get spending insights |

## Category Colors

- Food: Green
- Travel: Blue
- Utilities: Orange
- Shopping: Purple
- Healthcare: Red
- Entertainment: Yellow
- Other: Gray

## Usage

1. **Upload a Bill**: Drag and drop or click to upload a bill image
2. **Extract Data**: Click "Extract Bill Data" to use AI extraction
3. **Review**: Edit the extracted data if needed
4. **Save**: Click "Save Bill" to store the bill
5. **View Insights**: Switch to the Insights tab to see spending analytics
6. **Export**: Click "Export CSV" to download all bills
