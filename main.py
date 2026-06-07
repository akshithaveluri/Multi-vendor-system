import os
import io
import json
import uuid
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import PyPDF2
import chromadb
from sentence_transformers import SentenceTransformer
from groq import Groq

load_dotenv()

DOCS_META_PATH = Path("docs_meta.json")
CHROMA_DIR = "./chroma_db"

_embedder = None
_llm_client = None
_chroma_client = None

def get_embedder():
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedder

def get_llm():
    global _llm_client
    if _llm_client is None:
        key = os.getenv("GROQ_API_KEY")
        #if not key:
           # raise RuntimeError("GROQ_API_KEY environment variable not set")
        _llm_client = Groq(api_key=key)
    return _llm_client

def get_chroma():
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
    return _chroma_client

def get_collection():
    return get_chroma().get_or_create_collection(name="contracts")

def load_docs_meta() -> list[dict]:
    if not DOCS_META_PATH.exists():
        return []
    return json.loads(DOCS_META_PATH.read_text(encoding="utf-8"))

def save_docs_meta(meta: list[dict]):
    DOCS_META_PATH.write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

def extract_text_from_pdf(raw: bytes) -> str:
    file_bytes = io.BytesIO(raw)
    reader = PyPDF2.PdfReader(file_bytes)
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text.strip()

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            last_period = text.rfind(". ", start, end)
            last_newline = text.rfind("\n", start, end)
            break_point = max(last_period, last_newline)
            if break_point > start:
                end = break_point + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - overlap if end < len(text) else len(text)
        if start <= 0:
            break
    return chunks

@asynccontextmanager
async def lifespan(app: FastAPI):
    get_chroma()
    yield

app = FastAPI(title="Ideavize AI - Contract RAG System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload")
async def upload_contract(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    raw = await file.read()
    text = extract_text_from_pdf(raw)
    if not text:
        raise HTTPException(400, "Could not extract text from PDF")

    chunks = chunk_text(text)
    doc_id = str(uuid.uuid4())

    embedder = get_embedder()
    embeddings = embedder.encode(chunks, show_progress_bar=False).tolist()

    collection = get_collection()
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metadatas = [
        {"doc_id": doc_id, "doc_name": file.filename, "chunk_index": i, "text": chunks[i]}
        for i in range(len(chunks))
    ]

    collection.add(ids=ids, embeddings=embeddings, metadatas=metadatas)

    meta = load_docs_meta()
    meta.append({
        "doc_id": doc_id,
        "doc_name": file.filename,
        "chunk_count": len(chunks),
        "uploaded_at": datetime.now().isoformat(),
    })
    save_docs_meta(meta)

    return {"doc_id": doc_id, "doc_name": file.filename, "chunks": len(chunks)}

@app.get("/query")
async def query_contracts(q: str = Query(..., description="Your question about the contracts")):
    embedder = get_embedder()
    q_emb = embedder.encode([q], show_progress_bar=False).tolist()

    collection = get_collection()
    results = collection.query(query_embeddings=q_emb, n_results=5)

    if not results["metadatas"][0]:
        return {"question": q, "answer": "No relevant contract content found.", "sources": []}

    context_parts = []
    sources = []
    seen_docs = set()
    for meta in results["metadatas"][0]:
        context_parts.append(meta["text"])
        if meta["doc_name"] not in seen_docs:
            sources.append({"doc_name": meta["doc_name"], "doc_id": meta["doc_id"]})
            seen_docs.add(meta["doc_name"])

    context = "\n\n---\n\n".join(context_parts)

    prompt = f"""You are a contract analysis assistant. Answer the question based ONLY on the provided context.

Context:
{context}

Question: {q}

Answer concisely and cite which document(s) you reference."""

    llm = get_llm()
    completion = llm.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": "You are a helpful contract analyst assistant."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=1024,
    )

    return {
        "question": q,
        "answer": completion.choices[0].message.content,
        "sources": sources,
    }

@app.get("/documents")
async def list_documents():
    return load_docs_meta()

@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    collection = get_collection()
    collection.delete(where={"doc_id": doc_id})

    meta = load_docs_meta()
    meta = [d for d in meta if d["doc_id"] != doc_id]
    save_docs_meta(meta)

    return {"deleted": doc_id}

@app.get("/analyze")
async def analyze_contracts():
    meta = load_docs_meta()
    if not meta:
        raise HTTPException(400, "No contracts uploaded. Upload at least one contract first.")

    collection = get_collection()

    contracts_text = []
    for doc in meta:
        results = collection.get(where={"doc_id": doc["doc_id"]}, include=["metadatas"])
        if not results["metadatas"]:
            continue
        texts = [m["text"] for m in results["metadatas"]]
        full_text = "\n".join(texts)
        contracts_text.append(f"--- {doc['doc_name']} ---\n{full_text}")

    all_text = "\n\n".join(contracts_text)

    if len(all_text) > 15000:
        all_text = all_text[:15000] + "\n\n[truncated...]"

    prompt = f"""Analyze the following contracts and return ONLY valid JSON with this exact structure:
{{
  "analysis": [
    {{
      "doc_name": "filename.pdf",
      "risk_score": <number 1-10>,
      "risk_level": "Low" or "Medium" or "High" or "Critical",
      "key_terms": {{
        "pricing": "extracted pricing info",
        "contract_duration": "duration info",
        "termination_clause": "termination terms",
        "liability_cap": "liability limit",
        "service_level": "SLA details"
      }},
      "pros": ["pro 1", "pro 2"],
      "cons": ["con 1", "con 2"],
      "overall_assessment": "brief assessment of this vendor"
    }}
  ],
  "overall_recommendation": "which vendor is recommended and why"
}}

Contracts:
{all_text}"""

    llm = get_llm()
    completion = llm.chat.completions.create(
        model="llama-3.1-8b-instant",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a contract analyst. Always respond with valid JSON."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=2048,
    )

    try:
        return json.loads(completion.choices[0].message.content)
    except json.JSONDecodeError:
        return {"error": "Failed to parse analysis", "raw": completion.choices[0].message.content}

@app.get("/health")
async def health():
    return {"status": "ok"}
