package assets

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidDownloadToken = errors.New("invalid asset download token")

type DownloadTicket struct {
	Token     string
	ExpiresAt time.Time
}

type downloadClaims struct {
	AssetID  string   `json:"assetId,omitempty"`
	AssetIDs []string `json:"assetIds,omitempty"`
	jwt.RegisteredClaims
}

func (manager DownloadTokenManager) IssueArchive(userID string, assetIDs []string) (DownloadTicket, error) {
	if userID == "" || len(assetIDs) == 0 || manager.ttl <= 0 {
		return DownloadTicket{}, ErrInvalidDownloadToken
	}
	now := time.Now()
	expiresAt := now.Add(manager.ttl)
	claims := downloadClaims{
		AssetIDs:         assetIDs,
		RegisteredClaims: jwt.RegisteredClaims{Issuer: manager.issuer, Subject: userID, Audience: jwt.ClaimStrings{"asset-archive"}, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(expiresAt)},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(manager.secret)
	return DownloadTicket{Token: token, ExpiresAt: expiresAt}, err
}

type DownloadTokenManager struct {
	secret []byte
	issuer string
	ttl    time.Duration
}

func (manager DownloadTokenManager) ParseArchive(rawToken string) (string, []string, error) {
	claims := downloadClaims{}
	token, err := jwt.ParseWithClaims(rawToken, &claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrInvalidDownloadToken
		}
		return manager.secret, nil
	}, jwt.WithIssuer(manager.issuer), jwt.WithAudience("asset-archive"), jwt.WithExpirationRequired())
	if err != nil || !token.Valid || claims.Subject == "" || len(claims.AssetIDs) == 0 {
		return "", nil, ErrInvalidDownloadToken
	}
	return claims.Subject, claims.AssetIDs, nil
}

func NewDownloadTokenManager(secret, issuer string, ttl time.Duration) DownloadTokenManager {
	return DownloadTokenManager{secret: []byte(secret), issuer: issuer + ":asset-download", ttl: ttl}
}

func (manager DownloadTokenManager) Issue(userID, assetID string) (DownloadTicket, error) {
	if userID == "" || assetID == "" || manager.ttl <= 0 {
		return DownloadTicket{}, ErrInvalidDownloadToken
	}
	now := time.Now()
	expiresAt := now.Add(manager.ttl)
	claims := downloadClaims{
		AssetID: assetID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    manager.issuer,
			Subject:   userID,
			Audience:  jwt.ClaimStrings{"asset-download"},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(manager.secret)
	return DownloadTicket{Token: token, ExpiresAt: expiresAt}, err
}

func (manager DownloadTokenManager) Parse(rawToken, assetID string) (string, error) {
	claims := downloadClaims{}
	token, err := jwt.ParseWithClaims(rawToken, &claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, ErrInvalidDownloadToken
		}
		return manager.secret, nil
	}, jwt.WithIssuer(manager.issuer), jwt.WithAudience("asset-download"), jwt.WithExpirationRequired())
	if err != nil || !token.Valid || claims.Subject == "" || claims.AssetID == "" || claims.AssetID != assetID {
		return "", ErrInvalidDownloadToken
	}
	return claims.Subject, nil
}
