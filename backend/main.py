import os
import uuid
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, validator
from typing import Optional, List
from dotenv import load_dotenv

from database import init_db, insert_bill, get_all_bills, delete_bill, get_insights
from extractor import init_client, extract_bill_data

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Bill Tracker API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory if it doesn't exist
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Mount uploads directory for serving images
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


class BillCreate(BaseModel):
    vendor: str
    category: str
    date: str
    amount: float
    image_path: str

    @validator("amount")
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be a positive number")
        return v


class IssueReport(BaseModel):
    title: str
    issue_type: str  # bug, enhancement, question
    description: Optional[str] = ""
    environment: Optional[str] = ""
    console_logs: Optional[str] = ""
    screenshot: Optional[str] = None  # base64 encoded image


@app.on_event("startup")
async def startup_event():
    """Initialize database and NVIDIA API client on startup."""
    init_db()
    api_key = os.getenv("NVIDIA_API_KEY")
    if api_key:
        init_client(api_key)
    else:
        print("Warning: NVIDIA_API_KEY not found in environment variables")


@app.post("/upload")
async def upload_bill(file: UploadFile = File(...)):
    """
    Upload a bill image, extract data using AI, and return extracted data.
    Does NOT save to database - client must call POST /bills to save.
    """
    print(f"[DEBUG] Upload endpoint called with file: {file.filename}")

    # Validate file type
    allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: jpg, jpeg, png, gif, webp")

    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOADS_DIR, unique_filename)

    # Save the file
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Extract bill data using AI
    try:
        extracted_data = extract_bill_data(file_path)
    except Exception as e:
        extracted_data = {
            "vendor_name": None,
            "category": "other",
            "date": None,
            "total_amount": None,
            "extraction_success": False,
            "error": str(e)
        }

    # Return extracted data with image path
    return {
        "image_path": f"/uploads/{unique_filename}",
        "vendor_name": extracted_data.get("vendor_name"),
        "category": extracted_data.get("category", "other"),
        "date": extracted_data.get("date"),
        "total_amount": extracted_data.get("total_amount"),
        "extraction_success": extracted_data.get("extraction_success", False),
        "error": extracted_data.get("error")
    }


@app.post("/bills")
async def create_bill(bill: BillCreate):
    """Save a bill to the database."""
    try:
        saved_bill = insert_bill(
            date=bill.date,
            vendor=bill.vendor,
            category=bill.category,
            amount=bill.amount,
            image_path=bill.image_path
        )
        return saved_bill
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save bill: {str(e)}")


@app.get("/bills")
async def list_bills():
    """Get all bills ordered by date descending."""
    try:
        bills = get_all_bills()
        return bills
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch bills: {str(e)}")


@app.delete("/bills/{bill_id}")
async def remove_bill(bill_id: int):
    """Delete a bill by ID."""
    try:
        deleted = delete_bill(bill_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Bill not found")
        return {"message": "Bill deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete bill: {str(e)}")


@app.get("/insights")
async def get_spending_insights():
    """Get spending insights and statistics."""
    try:
        insights = get_insights()
        return insights
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch insights: {str(e)}")


@app.post("/report-issue")
async def report_issue(issue: IssueReport):
    """Create a GitHub issue for bug reports or feature requests."""
    github_token = os.getenv("GITHUB_TOKEN")
    if not github_token:
        raise HTTPException(status_code=500, detail="GitHub token not configured")

    # GitHub repo details
    repo_owner = "Paawan13"
    repo_name = "bill_tracker"

    # Build issue body
    type_labels = {
        "bug": "Bug Report",
        "enhancement": "Feature Request",
        "question": "Question"
    }

    body = f"## {type_labels.get(issue.issue_type, 'Issue')}\n\n"

    if issue.description:
        body += f"### Description\n{issue.description}\n\n"

    if issue.environment:
        body += f"### Environment\n{issue.environment}\n\n"

    if issue.console_logs:
        body += f"### Console Logs\n```\n{issue.console_logs}\n```\n\n"

    # Prepare labels
    labels = [issue.issue_type] if issue.issue_type in ["bug", "enhancement", "question"] else []

    # Create issue via GitHub API
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.github.com/repos/{repo_owner}/{repo_name}/issues",
                headers={
                    "Authorization": f"token {github_token}",
                    "Accept": "application/vnd.github.v3+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                json={
                    "title": f"[{type_labels.get(issue.issue_type, 'Issue')}] {issue.title}",
                    "body": body,
                    "labels": labels
                }
            )

            if response.status_code == 201:
                issue_data = response.json()
                return {
                    "success": True,
                    "issue_number": issue_data["number"],
                    "issue_url": issue_data["html_url"]
                }
            else:
                error_detail = response.json().get("message", "Unknown error")
                raise HTTPException(status_code=response.status_code, detail=f"GitHub API error: {error_detail}")

    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to GitHub: {str(e)}")
