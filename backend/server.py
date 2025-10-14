from pydantic import BaseModel, Field
from typing import List, Dict
from openai import OpenAI
import os
from dotenv import load_dotenv
import json
import io
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Query
import tensorflow.lite as tflite


load_dotenv(override=True)


# ======================
# Initialize FastAPI app
# ======================
app = FastAPI(
    title="Plant Disease Detection API",
    description="Upload a plant leaf image to detect disease and get treatment suggestions.",
    version="1.0.0"
)

# ======================
# Load TFLite Models
# ======================
try:
    # Gatekeeper model: checks if image contains a plant leaf
    gatekeeper_interpreter = tflite.Interpreter(model_path="models/GateKeeper_for_plant.tflite")
    gatekeeper_interpreter.allocate_tensors()
    gatekeeper_input_details = gatekeeper_interpreter.get_input_details()
    gatekeeper_output_details = gatekeeper_interpreter.get_output_details()

    # Disease classification model
    disease_interpreter = tflite.Interpreter(model_path="models/Crop_Disease_Detector.tflite")
    disease_interpreter.allocate_tensors()
    disease_input_details = disease_interpreter.get_input_details()
    disease_output_details = disease_interpreter.get_output_details()

except Exception as e:
    raise RuntimeError(f"Error loading TFLite models: {e}")


# ======================
# Helper Functions
# ======================
def load_and_prep_image(image_bytes, img_shape=224, scale=False):
    """
    Reads an image from bytes using Pillow, converts to RGB,
    resizes to (img_shape, img_shape), returns NumPy array (H, W, C).
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = img.resize((img_shape, img_shape))
        img_array = np.array(img, dtype=np.float32)
        if scale:
            img_array = img_array / 255.0
        return img_array
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {e}")


def get_class_names():
    """Loads class names from class_names.json."""
    try:
        with open("models/class_names.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="class_names.json file not found.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid JSON in class_names.json.")


# ======================
# Response Schema
# ======================
class DiseasePrediction(BaseModel):
    predicted_disease: str
    confidence_score: float

class MedicineInfo(BaseModel):
    name: str
    typical_dosage_or_application: str
    notes: str

class DiseaseInfo(BaseModel):
    medicines: List[MedicineInfo] = Field(..., description="List of medicines with details")
    precautions: List[str] = Field(..., description="List of safety precautions")
    causes: List[str] = Field(..., description="List of causes for the disease")
    summary: str = Field(..., description="Summary of the disease")
    disclaimer: str = Field(..., description="Disclaimer regarding medical advice")

class ResponseFormat(BaseModel):
    disease_info: DiseasePrediction
    treatment_details: DiseaseInfo

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


gemini = OpenAI(
    api_key=os.getenv("GOOGLE_API_KEY"), 
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

system_prompt = """
You are AgroLens, an expert agricultural assistant,providing detailed information about diseases and their treatments, for the user provided disease name in the user asked language.
"""

chat_system_prompt = """
You are AgroLens, a helpful and professional agricultural assistant. You are chatting with a user about a plant disease diagnosis they just received. Provide clear, concise, and safe advice.
IMPORTANT: chat with the user in a friendly manner, but do NOT provide any medical advice. Always recommend consulting a professional agronomist or plant pathologist for treatment decisions.
IMPORTANT: Chat with the user in the language they used to ask their question.
"""

def get_disease_info(disease: str, language: str) -> DiseaseInfo:
    messages = [{"role": "system", "content": system_prompt}] + [{"role": "user", "content": disease + " in " + language}]
    response = gemini.beta.chat.completions.parse(model="gemini-2.0-flash", messages=messages, response_format=DiseaseInfo)
    return response.choices[0].message.parsed


# ======================
# API Endpoints
# ======================
@app.get("/")
async def root():
    return {
        "message": "Welcome to the Plant Disease Detection API!",
        "usage": "POST a plant leaf image to /detect_disease to identify the disease and get treatment suggestions."
    }


@app.post("/detect_disease", response_model=ResponseFormat)
async def detect_disease(
    file: UploadFile = File(...),
    language: str = Query("English", description="Language for the response (e.g., 'Spanish', 'Hindi')"),
    class_names: dict = Depends(get_class_names)
):
    """
    Upload a plant leaf image → detect if it's a valid plant → predict the disease.
    """
    try:
        image_bytes = await file.read()
        img_array = load_and_prep_image(image_bytes, scale=False)
        img_expanded = np.expand_dims(img_array, axis=0)

        # ========= GATEKEEPER MODEL =========
        gatekeeper_interpreter.set_tensor(
            gatekeeper_input_details[0]['index'], img_expanded
        )
        gatekeeper_interpreter.invoke()
        gatekeeper_pred_prob = gatekeeper_interpreter.get_tensor(
            gatekeeper_output_details[0]['index']
        )

        plant_prob = gatekeeper_pred_prob[0][0]

        if int(round(plant_prob)) == 0:
            raise HTTPException(
                status_code=400,
                detail="No valid plant leaf detected. Please upload a clear image of a plant leaf."
            )

        # ========= DISEASE MODEL =========
        disease_interpreter.set_tensor(disease_input_details[0]['index'], img_expanded)
        disease_interpreter.invoke()
        pred_prob = disease_interpreter.get_tensor(disease_output_details[0]['index'])

        predicted_index = int(np.argmax(pred_prob))
        predicted_disease = class_names[str(predicted_index)]
        confidence_score = float(np.max(pred_prob) * 100)

        return ResponseFormat(
            disease_info=DiseasePrediction(
                predicted_disease=predicted_disease,
                confidence_score=confidence_score
            ),
            treatment_details=get_disease_info(predicted_disease, language)
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")



@app.post("/chat", response_model=Dict[str, str])
async def chat(request: ChatRequest):
    """Have a conversation with the AgroAid assistant about a diagnosis."""
    try:
        history_dicts = [{"role": msg.role, "content": msg.content} for msg in request.history]
        messages = [{"role": "system", "content": chat_system_prompt}] + history_dicts + [{"role": "user", "content": request.message}]
        
        response = gemini.chat.completions.create(
            model="gemini-2.0-flash",
            messages=messages,
        )

        return {"response": response.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during chat completion: {e}")