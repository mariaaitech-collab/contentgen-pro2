from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
import requests
import os

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

APP_ID = os.getenv("FACEBOOK_APP_ID")
APP_SECRET = os.getenv("FACEBOOK_APP_SECRET")
REDIRECT_URI = os.getenv("FACEBOOK_REDIRECT_URI")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

@app.get("/")
def home():
    return {"message": "Backend Running 🚀"}

@app.get("/login/facebook")
def login_facebook():
    url = (
        f"https://www.facebook.com/v23.0/dialog/oauth"
        f"?client_id={APP_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&scope=email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,business_management"
    )
    return RedirectResponse(url)

@app.get("/auth/facebook/callback")
def facebook_callback(code: str):
    token_url = (
        "https://graph.facebook.com/v23.0/oauth/access_token"
        f"?client_id={APP_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&client_secret={APP_SECRET}"
        f"&code={code}"
    )
    return requests.get(token_url).json()

# ---> YEH WALA HISA MISSING THA, AB ADD HO GAYA HAI <---
@app.get("/get-pages")
def get_pages(access_token: str):
    url = f"https://graph.facebook.com/v23.0/me/accounts?access_token={access_token}"
    return requests.get(url).json()

class PostData(BaseModel):
    page_id: str
    page_access_token: str
    message: str

@app.post("/post-to-page")
def post_to_page(data: PostData):
    url = f"https://graph.facebook.com/v23.0/{data.page_id}/feed"
    payload = {
        "message": data.message,
        "access_token": data.page_access_token
    }
    return requests.post(url, data=payload).json()

class AIGenerateData(BaseModel):
    topic: str
    page_id: str
    page_access_token: str

@app.post("/generate-and-post")
def generate_and_post(data: AIGenerateData):
    try:
        model = genai.GenerativeModel("gemini-pro")
        prompt = f"Write an engaging and professional social media post about '{data.topic}'. Include relevant emojis and hashtags. Do not include any title, just the post body."
        
        ai_response = model.generate_content(prompt)
        generated_message = ai_response.text

        fb_url = f"https://graph.facebook.com/v23.0/{data.page_id}/feed"
        payload = {"message": generated_message, "access_token": data.page_access_token}
        fb_response = requests.post(fb_url, data=payload).json()
        
        return {"status": "Success! 🚀", "ai_generated_content": generated_message, "facebook_response": fb_response}
    except Exception as e:
        return {"status": "Error", "details": str(e)}