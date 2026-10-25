package modelchannels

import (
	"context"
	rand "math/rand/v2"
	"sort"
	"strings"
	"time"
)

type RouteCandidate struct {
	ChannelID      string `json:"channelId"`
	ChannelName    string `json:"channelName"`
	Protocol       string `json:"protocol"`
	Priority       int    `json:"priority"`
	Weight         int    `json:"weight"`
	ActiveRequests int    `json:"activeRequests"`
	MaxConcurrency int    `json:"maxConcurrency"`
	Cooling        bool   `json:"cooling"`
	Available      bool   `json:"available"`
	Reason         string `json:"reason"`
	Selected       bool   `json:"selected"`
	FailoverTo     string `json:"failoverTo,omitempty"`
}
type RouteSimulation struct {
	Model             string           `json:"model"`
	Size              string           `json:"size"`
	Quality           string           `json:"quality"`
	Candidates        []RouteCandidate `json:"candidates"`
	SelectedChannelID string           `json:"selectedChannelId,omitempty"`
}
type RouteStat struct {
	Model            string  `json:"model"`
	ChannelID        string  `json:"channelId"`
	ChannelName      string  `json:"channelName"`
	Requests         int64   `json:"requests"`
	Succeeded        int64   `json:"succeeded"`
	AverageLatencyMS float64 `json:"averageLatencyMs"`
	TrafficShare     float64 `json:"trafficShare"`
}
type RuntimeStats struct {
	Window           string           `json:"window"`
	Requests         int64            `json:"requests"`
	SuccessRate      float64          `json:"successRate"`
	AverageLatencyMS float64          `json:"averageLatencyMs"`
	AutoSwitches     int64            `json:"autoSwitches"`
	PeakConcurrency  int              `json:"peakConcurrency"`
	HTTPErrors       map[string]int64 `json:"httpErrors"`
	Routes           []RouteStat      `json:"routes"`
}

func (service *Service) SimulateImageRoute(ctx context.Context, model, size, quality string) (RouteSimulation, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		return RouteSimulation{}, ErrInvalidModel
	}
	channels, err := service.repository.List(ctx)
	if err != nil {
		return RouteSimulation{}, err
	}
	now := time.Now()
	items := []RouteCandidate{}
	for _, channel := range channels {
		for _, item := range channel.Models {
			if !strings.EqualFold(item.ModelID, model) || item.Capability != "image" || !item.Enabled {
				continue
			}
			cooling := channel.CooldownUntil != nil && channel.CooldownUntil.After(now)
			available := channel.Enabled && !cooling && channel.ActiveRequests < channel.MaxConcurrency
			reason := "可用"
			if !channel.Enabled {
				reason = "渠道已停用"
			} else if cooling {
				reason = "渠道冷却中"
			} else if channel.ActiveRequests >= channel.MaxConcurrency {
				reason = "已达到最大并发"
			}
			items = append(items, RouteCandidate{ChannelID: channel.ID, ChannelName: channel.Name, Protocol: channel.Protocol, Priority: channel.Priority, Weight: channel.Weight, ActiveRequests: channel.ActiveRequests, MaxConcurrency: channel.MaxConcurrency, Cooling: cooling, Available: available, Reason: reason})
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Available != items[j].Available {
			return items[i].Available
		}
		if items[i].Priority != items[j].Priority {
			return items[i].Priority < items[j].Priority
		}
		return items[i].Weight > items[j].Weight
	})
	available := []int{}
	minimum := 0
	for index, item := range items {
		if !item.Available {
			continue
		}
		if len(available) == 0 {
			minimum = item.Priority
		}
		if item.Priority == minimum {
			available = append(available, index)
		}
	}
	selected := -1
	total := 0
	for _, index := range available {
		total += items[index].Weight
	}
	if total > 0 {
		pick := rand.IntN(total)
		for _, index := range available {
			pick -= items[index].Weight
			if pick < 0 {
				selected = index
				break
			}
		}
	}
	if selected >= 0 {
		items[selected].Selected = true
		selectedItem := items[selected]
		items = append([]RouteCandidate{selectedItem}, append(items[:selected], items[selected+1:]...)...)
	}
	for index := range items {
		for next := index + 1; next < len(items); next++ {
			if items[next].Available {
				items[index].FailoverTo = items[next].ChannelName
				break
			}
		}
	}
	result := RouteSimulation{Model: model, Size: size, Quality: quality, Candidates: items}
	if len(items) > 0 && items[0].Selected {
		result.SelectedChannelID = items[0].ChannelID
	}
	return result, nil
}

func (repository *Repository) RuntimeStats(ctx context.Context, window string) (RuntimeStats, error) {
	duration := 24 * time.Hour
	if window == "7d" {
		duration = 7 * 24 * time.Hour
	} else if window != "24h" {
		return RuntimeStats{}, ErrInvalidChannel
	}
	since := time.Now().Add(-duration)
	stats := RuntimeStats{Window: window, HTTPErrors: map[string]int64{}, Routes: []RouteStat{}}
	var succeeded int64
	if err := repository.pool.QueryRow(ctx, `SELECT count(*),count(*) FILTER(WHERE status='succeeded'),coalesce(avg(duration_ms),0),count(*) FILTER(WHERE attempt_no>1),coalesce(max(concurrency_at_start),0) FROM generation_attempts WHERE created_at >= $1`, since).Scan(&stats.Requests, &succeeded, &stats.AverageLatencyMS, &stats.AutoSwitches, &stats.PeakConcurrency); err != nil {
		return RuntimeStats{}, err
	}
	if stats.Requests > 0 {
		stats.SuccessRate = float64(succeeded) * 100 / float64(stats.Requests)
	}
	rows, err := repository.pool.Query(ctx, `SELECT coalesce(http_status::text,'network'),count(*) FROM generation_attempts WHERE created_at >= $1 AND status IN('failed','unknown') GROUP BY 1 ORDER BY 2 DESC`, since)
	if err != nil {
		return RuntimeStats{}, err
	}
	for rows.Next() {
		var key string
		var count int64
		if err := rows.Scan(&key, &count); err != nil {
			rows.Close()
			return RuntimeStats{}, err
		}
		stats.HTTPErrors[key] = count
	}
	rows.Close()
	routeRows, err := repository.pool.Query(ctx, `SELECT t.model,coalesce(a.channel_id::text,''),coalesce(c.name,''),count(*),count(*) FILTER(WHERE a.status='succeeded'),coalesce(avg(a.duration_ms),0) FROM generation_attempts a JOIN generation_tasks t ON t.id=a.task_id LEFT JOIN model_channels c ON c.id=a.channel_id WHERE a.created_at >= $1 GROUP BY t.model,a.channel_id,c.name ORDER BY count(*) DESC`, since)
	if err != nil {
		return RuntimeStats{}, err
	}
	defer routeRows.Close()
	for routeRows.Next() {
		var item RouteStat
		if err := routeRows.Scan(&item.Model, &item.ChannelID, &item.ChannelName, &item.Requests, &item.Succeeded, &item.AverageLatencyMS); err != nil {
			return RuntimeStats{}, err
		}
		if stats.Requests > 0 {
			item.TrafficShare = float64(item.Requests) * 100 / float64(stats.Requests)
		}
		stats.Routes = append(stats.Routes, item)
	}
	return stats, routeRows.Err()
}
func (service *Service) RuntimeStats(ctx context.Context, window string) (RuntimeStats, error) {
	return service.repository.RuntimeStats(ctx, window)
}
