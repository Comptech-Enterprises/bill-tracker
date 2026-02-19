import base64
import json
import os
import requests

NVIDIA_API_KEY = None
INVOKE_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL_NAME = "mistralai/mistral-large-3-675b-instruct-2512"


def init_client(api_key: str):
    """Initialize the NVIDIA API key."""
    global NVIDIA_API_KEY
    NVIDIA_API_KEY = api_key


def extract_bill_data(image_path: str) -> dict:
    """
    Extract bill data from an image using NVIDIA's Kimi K2.5 vision model.

    Returns a dict with: vendor_name, category, date, total_amount
    """
    if NVIDIA_API_KEY is None:
        raise ValueError("NVIDIA API key not initialized. Call init_client() first.")

    # Read and base64 encode the image
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode("utf-8")

    # Determine media type from file extension
    ext = os.path.splitext(image_path)[1].lower()
    media_type_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp"
    }
    media_type = media_type_map.get(ext, "image/jpeg")

    system_prompt = (
        "You are a bill analysis assistant. Analyze the bill image and return ONLY a valid JSON object "
        "with no extra text, no markdown, no code blocks, using this exact structure: "
        '{"vendor_name": string, "category": one of [food, travel, utilities, shopping, healthcare, entertainment, other], '
        '"date": "YYYY-MM-DD or null", "total_amount": number or null}. '
        "Return ONLY the JSON object, nothing else."
    )

    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json"
    }

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{image_data}"
                        }
                    },
                    {
                        "type": "text",
                        "text": system_prompt + " Please analyze this bill image and extract the vendor name, category, date, and total amount."
                    }
                ]
            }
        ],
        "max_tokens": 2048,
        "temperature": 0.1,
        "top_p": 1.00,
        "stream": False
    }

    try:
        print(f"[DEBUG] Sending request to NVIDIA API...")
        print(f"[DEBUG] Image size: {len(image_data)} bytes (base64)")
        response = requests.post(INVOKE_URL, headers=headers, json=payload, timeout=60)
        print(f"[DEBUG] Response status: {response.status_code}")

        # Log full response for debugging
        try:
            resp_json = response.json()
            print(f"[DEBUG] Response JSON: {json.dumps(resp_json, indent=2)[:1000]}")
        except:
            print(f"[DEBUG] Response text: {response.text[:1000]}")

        response.raise_for_status()

        result = response.json()

        # Extract the response text - handle potential different response structures
        message = result.get("choices", [{}])[0].get("message", {})
        response_text = message.get("content", "")

        # Some models return thinking + content separately
        if not response_text and "reasoning_content" in message:
            response_text = message.get("content", "") or ""

        print(f"[DEBUG] Extracted content: {response_text[:500]}")

        if not response_text:
            return {
                "vendor_name": None,
                "category": "other",
                "date": None,
                "total_amount": None,
                "extraction_success": False,
                "error": "Model returned empty response"
            }

        response_text = response_text.strip()

        # Try to extract JSON from the response
        # Handle cases where model might wrap JSON in markdown code blocks
        if "```" in response_text:
            lines = response_text.split("\n")
            json_lines = []
            in_json = False
            for line in lines:
                if line.startswith("```") and not in_json:
                    in_json = True
                    continue
                elif line.startswith("```") and in_json:
                    break
                elif in_json:
                    json_lines.append(line)
            if json_lines:
                response_text = "\n".join(json_lines)

        # Find JSON object in response if there's extra text
        start_idx = response_text.find("{")
        end_idx = response_text.rfind("}") + 1
        if start_idx != -1 and end_idx > start_idx:
            response_text = response_text[start_idx:end_idx]

        print(f"[DEBUG] JSON to parse: {response_text[:500]}")
        data = json.loads(response_text)

        return {
            "vendor_name": data.get("vendor_name"),
            "category": data.get("category", "other"),
            "date": data.get("date"),
            "total_amount": data.get("total_amount"),
            "extraction_success": True
        }

    except json.JSONDecodeError as e:
        print(f"[DEBUG] JSON decode error: {e}")
        return {
            "vendor_name": None,
            "category": "other",
            "date": None,
            "total_amount": None,
            "extraction_success": False,
            "error": "Could not parse bill data. Please fill in the details manually."
        }
    except requests.exceptions.RequestException as e:
        print(f"[DEBUG] Request error: {e}")
        return {
            "vendor_name": None,
            "category": "other",
            "date": None,
            "total_amount": None,
            "extraction_success": False,
            "error": f"API request failed: {str(e)}"
        }
    except Exception as e:
        print(f"[DEBUG] General error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "vendor_name": None,
            "category": "other",
            "date": None,
            "total_amount": None,
            "extraction_success": False,
            "error": str(e)
        }
