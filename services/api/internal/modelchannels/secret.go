package modelchannels

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

func (cipher SecretCipher) Encrypt(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	nonce := make([]byte, cipher.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := cipher.aead.Seal(nonce, nonce, []byte(value), nil)
	return base64.RawStdEncoding.EncodeToString(sealed), nil
}

func (cipher SecretCipher) Decrypt(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	sealed, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil || len(sealed) < cipher.aead.NonceSize() {
		return "", errors.New("invalid encrypted channel secret")
	}
	nonce := sealed[:cipher.aead.NonceSize()]
	plain, err := cipher.aead.Open(nil, nonce, sealed[cipher.aead.NonceSize():], nil)
	if err != nil {
		return "", errors.New("unable to decrypt channel secret")
	}
	return string(plain), nil
}
