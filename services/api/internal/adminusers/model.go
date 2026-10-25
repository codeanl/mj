package adminusers

import "time"

type User struct {
	AccountID     int64     `json:"accountId"`
	Email         string    `json:"email"`
	Username      string    `json:"username"`
	Role          string    `json:"role"`
	Status        string    `json:"status"`
	PointsBalance float64   `json:"pointsBalance"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	IsSelf        bool      `json:"isSelf"`
	internalID    string
}

type Summary struct {
	Total       int64   `json:"total"`
	Active      int64   `json:"active"`
	Admins      int64   `json:"admins"`
	Disabled    int64   `json:"disabled"`
	TotalPoints float64 `json:"totalPoints"`
}

type Page struct {
	Items    []User  `json:"items"`
	Total    int64   `json:"total"`
	Page     int     `json:"page"`
	PageSize int     `json:"pageSize"`
	Summary  Summary `json:"summary"`
}

type ListInput struct {
	Page      int
	PageSize  int
	Search    string
	AccountID *int64
	Role      string
	Status    string
}

type CreateInput struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
	Status   string `json:"status"`
}

type UpdateInput struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Status   string `json:"status"`
}

type PasswordInput struct {
	Password string `json:"password"`
}
