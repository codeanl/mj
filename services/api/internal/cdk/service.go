package cdk

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInvalidInput    = errors.New("invalid cdk input")
	ErrNotFound        = errors.New("cdk not found")
	ErrExpired         = errors.New("cdk expired")
	ErrExhausted       = errors.New("cdk exhausted")
	ErrAlreadyRedeemed = errors.New("cdk already redeemed")
	ErrDisabled        = errors.New("cdk disabled")
)

type Repository interface {
	Create(context.Context, string, []newCode) ([]Code, error)
	List(context.Context, ListInput) (Page, error)
	Delete(context.Context, []string) (int64, error)
	Redeem(context.Context, string, string) (RedeemResult, error)
}

type Service struct {
	repository Repository
	cipher     SecretCipher
}

type newCode struct {
	ID             string
	Hash           string
	Ciphertext     string
	Preview        string
	Plain          string
	Points         float64
	MaxRedemptions int
	Note           string
	ExpiresAt      *time.Time
}

func NewService(repository Repository, cipher SecretCipher) *Service {
	return &Service{repository: repository, cipher: cipher}
}

func (service *Service) Generate(ctx context.Context, actorID string, input GenerateInput) ([]Code, error) {
	input.Points = normalizeAmount(input.Points)
	input.Note = strings.TrimSpace(input.Note)
	if input.Count < 1 || input.Count > 100 || input.Points <= 0 || input.Points > 1_000_000 || input.MaxRedemptions < 1 || input.MaxRedemptions > 100_000 || len([]rune(input.Note)) > 200 || math.IsNaN(input.Points) || math.IsInf(input.Points, 0) {
		return nil, ErrInvalidInput
	}
	var expiresAt *time.Time
	if input.ExpiresInDays != nil {
		if *input.ExpiresInDays < 1 || *input.ExpiresInDays > 3650 {
			return nil, ErrInvalidInput
		}
		value := time.Now().UTC().AddDate(0, 0, *input.ExpiresInDays)
		expiresAt = &value
	}
	items := make([]newCode, 0, input.Count)
	for range input.Count {
		plain, err := generateCode()
		if err != nil {
			return nil, err
		}
		ciphertext, err := service.cipher.Encrypt(plain)
		if err != nil {
			return nil, err
		}
		items = append(items, newCode{Hash: hashCode(plain), Ciphertext: ciphertext, Preview: previewCode(plain), Plain: plain, Points: input.Points, MaxRedemptions: input.MaxRedemptions, Note: input.Note, ExpiresAt: expiresAt})
	}
	return service.repository.Create(ctx, actorID, items)
}

func (service *Service) List(ctx context.Context, input ListInput) (Page, error) {
	input.Search = strings.TrimSpace(input.Search)
	input.Filter = strings.TrimSpace(input.Filter)
	if input.Filter == "" {
		input.Filter = "all"
	}
	if input.Page < 1 || (input.PageSize != 20 && input.PageSize != 50) || len([]rune(input.Search)) > 100 || (input.Filter != "all" && input.Filter != "redeemed" && input.Filter != "unused" && input.Filter != "expired") {
		return Page{}, ErrInvalidInput
	}
	if strings.HasPrefix(strings.ToUpper(input.Search), "NOVA-") {
		input.CodeHash = hashCode(input.Search)
	}
	page, err := service.repository.List(ctx, input)
	if err != nil {
		return Page{}, err
	}
	for index := range page.Items {
		plain, err := service.cipher.Decrypt(page.Items[index].Code)
		if err != nil {
			return Page{}, err
		}
		page.Items[index].Code = plain
	}
	return page, nil
}

func (service *Service) Delete(ctx context.Context, ids []string) (int64, error) {
	if len(ids) < 1 || len(ids) > 100 {
		return 0, ErrInvalidInput
	}
	for _, id := range ids {
		if _, err := uuid.Parse(strings.TrimSpace(id)); err != nil {
			return 0, ErrInvalidInput
		}
	}
	return service.repository.Delete(ctx, ids)
}

func (service *Service) Redeem(ctx context.Context, userID string, input RedeemInput) (RedeemResult, error) {
	code := normalizeCode(input.Code)
	if len(code) != 22 || !strings.HasPrefix(code, "NOVA-") {
		return RedeemResult{}, ErrInvalidInput
	}
	return service.repository.Redeem(ctx, userID, hashCode(code))
}

func generateCode() (string, error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	bytes := make([]byte, 15)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	for index := range bytes {
		bytes[index] = alphabet[int(bytes[index])%len(alphabet)]
	}
	return fmt.Sprintf("NOVA-%s-%s-%s", bytes[:5], bytes[5:10], bytes[10:15]), nil
}

func normalizeCode(value string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(value), " ", ""))
}

func hashCode(value string) string {
	hash := sha256.Sum256([]byte(normalizeCode(value)))
	return hex.EncodeToString(hash[:])
}

func previewCode(value string) string {
	parts := strings.Split(value, "-")
	if len(parts) != 4 {
		return "NOVA-****"
	}
	return parts[0] + "-" + parts[1] + "-*****-" + parts[3]
}

func normalizeAmount(value float64) float64 {
	return math.Round(value*100) / 100
}
