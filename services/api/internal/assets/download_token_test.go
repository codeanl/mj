package assets

import (
	"errors"
	"mime"
	"testing"
	"time"
)

func TestDownloadTokenBindsUserAndAsset(t *testing.T) {
	manager := NewDownloadTokenManager("test-secret", "test-issuer", time.Minute)
	ticket, err := manager.Issue("user-1", "asset-1")
	if err != nil || ticket.Token == "" || ticket.ExpiresAt.Before(time.Now()) {
		t.Fatalf("issue ticket: %#v err=%v", ticket, err)
	}
	userID, err := manager.Parse(ticket.Token, "asset-1")
	if err != nil || userID != "user-1" {
		t.Fatalf("parse ticket: user=%q err=%v", userID, err)
	}
	if _, err := manager.Parse(ticket.Token, "asset-2"); !errors.Is(err, ErrInvalidDownloadToken) {
		t.Fatalf("ticket must not work for another asset: %v", err)
	}
	if _, err := manager.Parse(ticket.Token+"tampered", "asset-1"); !errors.Is(err, ErrInvalidDownloadToken) {
		t.Fatalf("tampered ticket must fail: %v", err)
	}
}

func TestArchiveDownloadTokenBindsUserAndAssets(t *testing.T) {
	manager := NewDownloadTokenManager("test-secret", "test-issuer", time.Minute)
	ticket, err := manager.IssueArchive("user-1", []string{"asset-1", "asset-2"})
	if err != nil || ticket.Token == "" || ticket.ExpiresAt.Before(time.Now()) {
		t.Fatalf("issue archive ticket: %#v err=%v", ticket, err)
	}
	userID, assetIDs, err := manager.ParseArchive(ticket.Token)
	if err != nil || userID != "user-1" || len(assetIDs) != 2 || assetIDs[0] != "asset-1" || assetIDs[1] != "asset-2" {
		t.Fatalf("parse archive ticket: user=%q assets=%#v err=%v", userID, assetIDs, err)
	}
	if _, _, err := manager.ParseArchive(ticket.Token + "tampered"); !errors.Is(err, ErrInvalidDownloadToken) {
		t.Fatalf("tampered archive ticket must fail: %v", err)
	}
	if _, _, err := manager.ParseArchive(""); !errors.Is(err, ErrInvalidDownloadToken) {
		t.Fatalf("empty archive ticket must fail: %v", err)
	}
}

func TestContentDispositionIncludesOneExtension(t *testing.T) {
	tests := []struct {
		asset    Asset
		expected string
	}{
		{asset: Asset{Title: "成片", OriginalName: "source.mp4", MimeType: "video/mp4"}, expected: "成片.mp4"},
		{asset: Asset{Title: "成片.mp4", OriginalName: "source.mp4", MimeType: "video/mp4"}, expected: "成片.mp4"},
	}
	for _, test := range tests {
		_, parameters, err := mime.ParseMediaType(ContentDisposition(test.asset))
		if err != nil || parameters["filename"] != test.expected {
			t.Fatalf("content disposition: %#v err=%v", parameters, err)
		}
	}
}
