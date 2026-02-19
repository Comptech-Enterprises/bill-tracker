import sqlite3
from datetime import datetime
from typing import Optional
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "bills.db")


def get_connection():
    """Get a database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize the database with the bills table."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            vendor TEXT,
            category TEXT,
            amount REAL,
            image_path TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


def insert_bill(date: str, vendor: str, category: str, amount: float, image_path: str) -> dict:
    """Insert a new bill into the database."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO bills (date, vendor, category, amount, image_path)
        VALUES (?, ?, ?, ?, ?)
        """,
        (date, vendor, category, amount, image_path)
    )
    conn.commit()
    bill_id = cursor.lastrowid

    cursor.execute("SELECT * FROM bills WHERE id = ?", (bill_id,))
    row = cursor.fetchone()
    conn.close()

    return dict(row)


def get_all_bills() -> list:
    """Get all bills ordered by date descending."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bills ORDER BY date DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def delete_bill(bill_id: int) -> bool:
    """Delete a bill by ID."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM bills WHERE id = ?", (bill_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def get_insights() -> dict:
    """Get spending insights."""
    conn = get_connection()
    cursor = conn.cursor()

    now = datetime.now()
    current_month = now.strftime("%Y-%m")
    current_year = now.strftime("%Y")

    # Spending by category for current month
    cursor.execute("""
        SELECT category, SUM(amount) as total
        FROM bills
        WHERE strftime('%Y-%m', date) = ?
        GROUP BY category
        ORDER BY total DESC
    """, (current_month,))
    spending_by_category = [{"category": row["category"], "total": row["total"]} for row in cursor.fetchall()]

    # Spending by category for current year
    cursor.execute("""
        SELECT category, SUM(amount) as total
        FROM bills
        WHERE strftime('%Y', date) = ?
        GROUP BY category
        ORDER BY total DESC
    """, (current_year,))
    spending_by_category_year = [{"category": row["category"], "total": row["total"]} for row in cursor.fetchall()]

    # Monthly trend for last 12 months
    cursor.execute("""
        SELECT strftime('%Y-%m', date) as month, SUM(amount) as total
        FROM bills
        WHERE date >= date('now', '-12 months')
        GROUP BY month
        ORDER BY month ASC
    """)
    monthly_trend = [{"month": row["month"], "total": row["total"]} for row in cursor.fetchall()]

    # Top category this month (fallback to year if month is empty)
    if spending_by_category:
        top_category = spending_by_category[0]["category"]
    elif spending_by_category_year:
        top_category = spending_by_category_year[0]["category"]
    else:
        top_category = None

    # Total this month
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total
        FROM bills
        WHERE strftime('%Y-%m', date) = ?
    """, (current_month,))
    total_this_month = cursor.fetchone()["total"]

    # Total this year
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total
        FROM bills
        WHERE strftime('%Y', date) = ?
    """, (current_year,))
    total_this_year = cursor.fetchone()["total"]

    # Monthly breakdown with category details (last 12 months)
    cursor.execute("""
        SELECT
            strftime('%Y-%m', date) as month,
            category,
            SUM(amount) as total,
            COUNT(*) as count
        FROM bills
        WHERE date >= date('now', '-12 months')
        GROUP BY month, category
        ORDER BY month DESC, total DESC
    """)

    monthly_breakdown_raw = cursor.fetchall()

    conn.close()

    # Organize by month
    monthly_breakdown = {}
    for row in monthly_breakdown_raw:
        month = row["month"]
        if month not in monthly_breakdown:
            monthly_breakdown[month] = {
                "month": month,
                "total": 0,
                "categories": []
            }
        monthly_breakdown[month]["total"] += row["total"]
        monthly_breakdown[month]["categories"].append({
            "category": row["category"],
            "total": row["total"],
            "count": row["count"]
        })

    # Convert to sorted list (most recent first)
    monthly_breakdown_list = sorted(
        monthly_breakdown.values(),
        key=lambda x: x["month"],
        reverse=True
    )

    return {
        "spending_by_category": spending_by_category,
        "spending_by_category_year": spending_by_category_year,
        "monthly_trend": monthly_trend,
        "top_category_this_month": top_category,
        "total_this_month": total_this_month,
        "total_this_year": total_this_year,
        "monthly_breakdown": monthly_breakdown_list
    }
