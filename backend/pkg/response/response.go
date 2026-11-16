package response

import (
	"encoding/json"
	"log"
	"net/http"
)

// Decode reads a JSON body into v; on failure it writes 400 and returns false.
func Decode(w http.ResponseWriter, r *http.Request, v interface{}) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(v); err != nil {
		Error(w, http.StatusBadRequest, "BAD_REQUEST", "Body JSON tidak valid")
		return false
	}
	return true
}

// Internal logs the real error and answers with a generic 500 so DB details never reach the client.
func Internal(w http.ResponseWriter, r *http.Request, err error) {
	log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
	Error(w, http.StatusInternalServerError, "INTERNAL", "Terjadi kesalahan pada server")
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   *APIError   `json:"error,omitempty"`
	Meta    *Meta       `json:"meta,omitempty"`
}

type APIError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

type Meta struct {
	Total  int    `json:"total,omitempty"`
	Cursor string `json:"cursor,omitempty"`
}

func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIResponse{Success: true, Data: data})
}

func JSONList(w http.ResponseWriter, status int, data interface{}, meta *Meta) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIResponse{Success: true, Data: data, Meta: meta})
}

func Error(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(APIResponse{
		Success: false,
		Error:   &APIError{Code: code, Message: message},
	})
}

func ValidationError(w http.ResponseWriter, fields map[string]string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnprocessableEntity)
	json.NewEncoder(w).Encode(APIResponse{
		Success: false,
		Error:   &APIError{Code: "VALIDATION_ERROR", Message: "Validasi gagal", Fields: fields},
	})
}

// JSON409 returns a conflict whose details let the UI show what blocks the action.
func JSON409(w http.ResponseWriter, code, message string, details interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusConflict)
	json.NewEncoder(w).Encode(APIResponse{Success: false, Data: details, Error: &APIError{Code: code, Message: message}})
}

func Conflict(w http.ResponseWriter, message string) {
	Error(w, http.StatusConflict, "CONFLICT", message)
}

func Forbidden(w http.ResponseWriter) {
	Error(w, http.StatusForbidden, "FORBIDDEN", "Akses ditolak")
}

func NotFound(w http.ResponseWriter) {
	Error(w, http.StatusNotFound, "NOT_FOUND", "Data tidak ditemukan")
}
