package cdk

import (
	"context"
	"errors"
	"testing"
)

type serviceRepository struct {
	created    []newCode
	listed     Page
	redeemHash string
}

func (repository *serviceRepository) Create(_ context.Context, _ string, inputs []newCode) ([]Code, error) {
	repository.created = inputs
	items := make([]Code, 0, len(inputs))
	for _, input := range inputs {
		items = append(items, Code{Code: input.Plain, CodePreview: input.Preview, Points: input.Points, MaxRedemptions: input.MaxRedemptions})
	}
	return items, nil
}

func (repository *serviceRepository) List(_ context.Context, _ ListInput) (Page, error) {
	return repository.listed, nil
}

func (repository *serviceRepository) Delete(_ context.Context, _ []string) (int64, error) {
	return 1, nil
}

func (repository *serviceRepository) Redeem(_ context.Context, _ string, codeHash string) (RedeemResult, error) {
	repository.redeemHash = codeHash
	return RedeemResult{Points: 12.5, Balance: 20}, nil
}

func TestGenerateCreatesEncryptedUniqueCodes(t *testing.T) {
	repository := &serviceRepository{}
	cipher := NewSecretCipher("test-secret")
	service := NewService(repository, cipher)
	items, err := service.Generate(context.Background(), "actor", GenerateInput{Count: 3, Points: 12.345, MaxRedemptions: 2, Note: " campaign "})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 3 || len(repository.created) != 3 {
		t.Fatalf("expected three generated codes, got %d", len(items))
	}
	seen := map[string]bool{}
	for index, input := range repository.created {
		if len(input.Plain) != 22 || input.Points != 12.35 || input.Note != "campaign" {
			t.Fatalf("unexpected generated input: %#v", input)
		}
		if seen[input.Plain] {
			t.Fatalf("duplicate generated code: %s", input.Plain)
		}
		seen[input.Plain] = true
		plain, err := cipher.Decrypt(input.Ciphertext)
		if err != nil || plain != input.Plain {
			t.Fatalf("code %d did not round trip through encryption", index)
		}
	}
}

func TestListDecryptsCodes(t *testing.T) {
	cipher := NewSecretCipher("test-secret")
	encrypted, err := cipher.Encrypt("NOVA-ABCDE-FGHJK-LMNPQ")
	if err != nil {
		t.Fatal(err)
	}
	repository := &serviceRepository{listed: Page{Items: []Code{{Code: encrypted}}, Page: 1, PageSize: 20}}
	page, err := NewService(repository, cipher).List(context.Background(), ListInput{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if page.Items[0].Code != "NOVA-ABCDE-FGHJK-LMNPQ" {
		t.Fatalf("unexpected decrypted code: %q", page.Items[0].Code)
	}
}

func TestRedeemNormalizesCodeBeforeLookup(t *testing.T) {
	repository := &serviceRepository{}
	service := NewService(repository, NewSecretCipher("test-secret"))
	if _, err := service.Redeem(context.Background(), "user", RedeemInput{Code: " nova-abcde-fghjk-lmnpq "}); err != nil {
		t.Fatal(err)
	}
	if repository.redeemHash != hashCode("NOVA-ABCDE-FGHJK-LMNPQ") {
		t.Fatal("redeem did not normalize the code")
	}
	if _, err := service.Redeem(context.Background(), "user", RedeemInput{Code: "invalid"}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("expected invalid input, got %v", err)
	}
}
