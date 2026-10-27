package auth

import (
	"io"
	"time"
)

type User struct {
	ID               string    `json:"id"`
	Email            string    `json:"email"`
	Username         string    `json:"username"`
	AvatarURL        string    `json:"avatarUrl,omitempty"`
	Role             string    `json:"role"`
	Status           string    `json:"status"`
	PointsBalance    float64   `json:"pointsBalance"`
	CreatedAt        time.Time `json:"createdAt"`
	SessionID        string    `json:"-"`
	avatarStorageKey string
	avatarMimeType   string
	avatarUpdatedAt  *time.Time
}

type userRecord struct {
	User
	PasswordHash string
}

type RegisterInput struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type ProfileInput struct {
	Username string `json:"username"`
}

type ClientInfo struct {
	UserAgent string
	IPAddress string
}

type Session struct {
	ID         string    `json:"id"`
	UserAgent  string    `json:"userAgent"`
	IPAddress  string    `json:"ipAddress"`
	ExpiresAt  time.Time `json:"expiresAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
	CreatedAt  time.Time `json:"createdAt"`
	Current    bool      `json:"current"`
}

type ChangePasswordInput struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type AccountDeletionRequest struct {
	ID          string     `json:"id"`
	Status      string     `json:"status"`
	RequestedAt time.Time  `json:"requestedAt"`
	CancelledAt *time.Time `json:"cancelledAt,omitempty"`
}

type RequestAccountDeletionInput struct {
	CurrentPassword string `json:"currentPassword"`
}

type Avatar struct {
	ContentType string
	UpdatedAt   time.Time
	Content     io.ReadSeekCloser
}

type Result struct {
	AccessToken string `json:"accessToken"`
	TokenType   string `json:"tokenType"`
	ExpiresIn   int64  `json:"expiresIn"`
	User        User   `json:"user"`
}
