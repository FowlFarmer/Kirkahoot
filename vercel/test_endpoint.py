"""Test /api/gemini — sends test_endpoint1.jpg with a text prompt."""
import base64
import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main() -> None:
    endpoint = "http://localhost:3000/api/gemini"

    image_path = os.path.join(os.path.dirname(__file__), "test_endpoint1.jpg")
    with open(image_path, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode("utf-8")
    
    payload = {
        "imageBase64": image_base64,
    }

    req = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    print(f"Sending request to {endpoint}")

    try:
        with urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            parsed = json.loads(body)
            print("Response:")
            print(json.dumps(parsed, indent=2))
    except HTTPError as http_err:
        body = http_err.read().decode("utf-8", errors="replace")
        print(f"HTTP {http_err.code}: {http_err.reason}")
        print(body)
    except URLError as url_err:
        print(f"Failed to reach endpoint: {url_err}")


if __name__ == "__main__":
    main()
