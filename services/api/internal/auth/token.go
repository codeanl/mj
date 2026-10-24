package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid access token")

type Claims struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

type TokenManager struct {
	secret []byte
	issuer string
	ttl    time.Duration
}

func NewTokenManager(secret, issuer string, ttl time.Duration) TokenManager {
	return TokenManager{secret: []byte(secret), issuer: issuer, ttl: ttl}
}

func (manager TokenManager) Issue(user User) (string, int64, error) {
	now := time.Now()
	expiresAt := now.Add(manager.ttl)
	claims := Claims{
		Email:    user.Email,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    manager.issuer,
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(manager.secret)
	return token, int64(manager.ttl.Seconds()), err
}

func (manager TokenManager) Parse(rawToken string) (Claims, error) {
	claims := Claims{}
	token, err := jwt.ParseWithClaims(rawToken, &claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrInvalidToken
		}
		return manager.secret, nil
	}, jwt.WithIssuer(manager.issuer), jwt.WithExpirationRequired())
	if err != nil || !token.Valid || claims.Subject == "" {
		return Claims{}, ErrInvalidToken
	}
	return claims, nil
}
