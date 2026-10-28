package cdk

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

type SecretCipher struct {
	aead cipher.AEAD
}

func NewSecretCipher(secret string) SecretCipher {
	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		panic(err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		panic(err)
	}
	return SecretCipher{aead: aead}
}

func (secretCipher SecretCipher) Encrypt(value string) (string, error) {
	nonce := make([]byte, secretCipher.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(secretCipher.aead.Seal(nonce, nonce, []byte(value), nil)), nil
}

func (secretCipher SecretCipher) Decrypt(value string) (string, error) {
	sealed, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil || len(sealed) < secretCipher.aead.NonceSize() {
		return "", errors.New("invalid encrypted cdk")
	}
	nonce := sealed[:secretCipher.aead.NonceSize()]
	plain, err := secretCipher.aead.Open(nil, nonce, sealed[secretCipher.aead.NonceSize():], nil)
	if err != nil {
		return "", errors.New("unable to decrypt cdk")
	}
	return string(plain), nil
}
