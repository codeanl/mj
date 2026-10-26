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
