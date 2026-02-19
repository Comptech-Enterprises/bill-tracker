// API Base URL
const API_URL = 'http://localhost:8000';

// Global state
let bills = [];
let categoryChart = null;
let trendChart = null;
let currentImagePath = null;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewContainer = document.getElementById('preview-container');
const imagePreview = document.getElementById('image-preview');
const extractBtn = document.getElementById('extract-btn');
const reviewForm = document.getElementById('review-form');
const billForm = document.getElementById('bill-form');
const extractionWarning = document.getElementById('extraction-warning');
const billsBody = document.getElementById('bills-body');
const noBills = document.getElementById('no-bills');
const exportBtn = document.getElementById('export-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const toast = document.getElementById('toast');
const tabBtns = document.querySelectorAll('.tab-btn');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initDropZone();
    initForm();
    initExport();
    fetchBills();
    fetchInsights();
});

// Tab switching
function initTabs() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show active tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabId}-tab`).classList.add('active');

            // Refresh insights when switching to insights tab
            if (tabId === 'insights') {
                fetchInsights();
            }
        });
    });
}

// Drag and drop handling
function initDropZone() {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    extractBtn.addEventListener('click', () => extractBill());
}

// Handle file selection
function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }

    // Show image preview
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        previewContainer.classList.remove('hidden');
        reviewForm.classList.add('hidden');
    };
    reader.readAsDataURL(file);

    // Store the file for upload
    fileInput.files = createFileList(file);
}

// Create a FileList from a single file
function createFileList(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
}

// Extract bill data from image
async function extractBill() {
    const file = fileInput.files[0];
    if (!file) {
        showToast('Please select an image first', 'error');
        return;
    }

    showLoading(true);

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload image');
        }

        const data = await response.json();

        // Store image path
        currentImagePath = data.image_path;
        document.getElementById('image-path').value = data.image_path;

        // Show warning if extraction failed
        if (!data.extraction_success) {
            extractionWarning.classList.remove('hidden');
        } else {
            extractionWarning.classList.add('hidden');
        }

        // Populate form with extracted data
        document.getElementById('vendor').value = data.vendor_name || '';
        document.getElementById('category').value = data.category || 'other';
        document.getElementById('date').value = data.date || '';
        document.getElementById('amount').value = data.total_amount || '';

        // Show review form
        reviewForm.classList.remove('hidden');

        showToast('Bill data extracted successfully', 'success');
    } catch (error) {
        console.error('Extract error:', error);
        showToast('Failed to extract bill data: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Form submission
function initForm() {
    billForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const amount = parseFloat(document.getElementById('amount').value);
        if (amount <= 0) {
            showToast('Amount must be a positive number', 'error');
            return;
        }

        await saveBill();
    });
}

// Save bill
async function saveBill() {
    showLoading(true);

    try {
        const billData = {
            vendor: document.getElementById('vendor').value,
            category: document.getElementById('category').value,
            date: document.getElementById('date').value,
            amount: parseFloat(document.getElementById('amount').value),
            image_path: document.getElementById('image-path').value
        };

        const response = await fetch(`${API_URL}/bills`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(billData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to save bill');
        }

        // Reset form and preview
        billForm.reset();
        previewContainer.classList.add('hidden');
        reviewForm.classList.add('hidden');
        currentImagePath = null;
        fileInput.value = '';

        // Refresh data
        await fetchBills();
        await fetchInsights();

        showToast('Bill saved successfully', 'success');
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save bill: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Fetch all bills
async function fetchBills() {
    try {
        const response = await fetch(`${API_URL}/bills`);
        if (!response.ok) {
            throw new Error('Failed to fetch bills');
        }

        bills = await response.json();
        renderTable(bills);
    } catch (error) {
        console.error('Fetch bills error:', error);
        // Don't show toast on initial load failure
    }
}

// Render bills table
function renderTable(bills) {
    billsBody.innerHTML = '';

    if (bills.length === 0) {
        noBills.classList.remove('hidden');
        return;
    }

    noBills.classList.add('hidden');

    bills.forEach(bill => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(bill.date)}</td>
            <td>${escapeHtml(bill.vendor)}</td>
            <td><span class="badge badge-${bill.category}">${bill.category}</span></td>
            <td>${formatCurrency(bill.amount)}</td>
            <td>
                <button class="btn btn-danger" onclick="deleteBill(${bill.id})">Delete</button>
            </td>
        `;
        billsBody.appendChild(tr);
    });
}

// Delete bill
async function deleteBill(id) {
    if (!confirm('Are you sure you want to delete this bill?')) {
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`${API_URL}/bills/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete bill');
        }

        await fetchBills();
        await fetchInsights();

        showToast('Bill deleted successfully', 'success');
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Failed to delete bill: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Fetch insights
async function fetchInsights() {
    try {
        const response = await fetch(`${API_URL}/insights`);
        if (!response.ok) {
            throw new Error('Failed to fetch insights');
        }

        const data = await response.json();
        renderInsights(data);
    } catch (error) {
        console.error('Fetch insights error:', error);
    }
}

// Render insights
function renderInsights(data) {
    // Update stat cards
    document.getElementById('total-month').textContent = formatCurrency(data.total_this_month || 0);
    document.getElementById('total-year').textContent = formatCurrency(data.total_this_year || 0);
    document.getElementById('top-category').textContent = data.top_category_this_month
        ? capitalizeFirst(data.top_category_this_month)
        : '-';

    // Render category chart
    renderCategoryChart(data.spending_by_category || []);

    // Render trend chart
    renderTrendChart(data.monthly_trend || []);
}

// Render category bar chart
function renderCategoryChart(data) {
    const ctx = document.getElementById('category-chart').getContext('2d');

    // Destroy existing chart
    if (categoryChart) {
        categoryChart.destroy();
    }

    const categoryColors = {
        food: '#28a745',
        travel: '#007bff',
        utilities: '#fd7e14',
        shopping: '#6f42c1',
        healthcare: '#dc3545',
        entertainment: '#ffc107',
        other: '#6c757d'
    };

    const labels = data.map(d => capitalizeFirst(d.category));
    const values = data.map(d => d.total);
    const colors = data.map(d => categoryColors[d.category] || categoryColors.other);

    categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Spending (₹)',
                data: values,
                backgroundColor: colors,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '₹' + value.toLocaleString('en-IN')
                    }
                }
            }
        }
    });
}

// Render monthly trend line chart
function renderTrendChart(data) {
    const ctx = document.getElementById('trend-chart').getContext('2d');

    // Destroy existing chart
    if (trendChart) {
        trendChart.destroy();
    }

    const labels = data.map(d => formatMonth(d.month));
    const values = data.map(d => d.total);

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Monthly Spending (₹)',
                data: values,
                borderColor: '#1a1a2e',
                backgroundColor: 'rgba(26, 26, 46, 0.1)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#1a1a2e',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => '₹' + value.toLocaleString('en-IN')
                    }
                }
            }
        }
    });
}

// Export CSV
function initExport() {
    exportBtn.addEventListener('click', exportCSV);
}

function exportCSV() {
    if (bills.length === 0) {
        showToast('No bills to export', 'error');
        return;
    }

    const headers = ['Date', 'Vendor', 'Category', 'Amount'];
    const rows = bills.map(bill => [
        bill.date,
        `"${bill.vendor.replace(/"/g, '""')}"`,
        bill.category,
        bill.amount.toFixed(2)
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `bills_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Bills exported successfully', 'success');
}

// Utility functions
function formatCurrency(amount) {
    return '₹' + parseFloat(amount).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatMonth(monthStr) {
    if (!monthStr) return '-';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short'
    });
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Make deleteBill available globally
window.deleteBill = deleteBill;
