from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config" / "tiktok-bot.json"
RUNTIME_DIR = ROOT / ".runtime"
STATUS_PATH = RUNTIME_DIR / "tiktok-bot.status.json"
COMMAND_PATH = RUNTIME_DIR / "tiktok-bot.command.json"
START_SCRIPT = ROOT / "INICIAR_TIKTOK_BOT.ps1"

ACTIONS = (
    ("scroll", "Assistir / rolar vídeos"),
    ("like", "Curtir"),
    ("comment", "Comentar"),
    ("follow", "Seguir"),
    ("share", "Compartilhar painel"),
)


class TikTokBotPanel(tk.Tk):
    def __init__(self) -> None:
        super().__init__()

        self.title("TikTok Bot - Android / Appium")
        self.geometry("1320x900")
        self.minsize(1160, 760)

        self.process: subprocess.Popen[str] | None = None
        self.output_queue: queue.Queue[str] = queue.Queue()
        self.seen_logs: set[str] = set()
        self._last_status_mtime = 0.0
        self._last_control_result_key = ""
        self._connection_refresh_inflight = False
        self._closing = False

        self.action_vars: dict[str, dict[str, tk.Variable]] = {}

        self._build_style()
        self._build_variables()
        self._build_ui()
        self.load_config()
        self.after(200, self._drain_output_queue)
        self.after(600, self._poll_status)
        self.after(1000, self._connection_monitor_tick)

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_style(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        self.configure(bg="#10131a")
        style.configure(".", font=("Segoe UI", 10))
        style.configure("TFrame", background="#10131a")
        style.configure("Card.TFrame", background="#171c26")
        style.configure("TLabel", background="#10131a", foreground="#e8ecf3")
        style.configure("Card.TLabel", background="#171c26", foreground="#e8ecf3")
        style.configure("Title.TLabel", background="#10131a", foreground="#ffffff", font=("Segoe UI Semibold", 18))
        style.configure("HeaderMuted.TLabel", background="#10131a", foreground="#9ca8bb")
        style.configure("Muted.TLabel", background="#171c26", foreground="#9ca8bb")
        style.configure("Status.TLabel", background="#171c26", foreground="#7bd88f", font=("Segoe UI Semibold", 11))
        style.configure("TCheckbutton", background="#171c26", foreground="#e8ecf3")
        style.configure("TLabelframe", background="#171c26", foreground="#e8ecf3")
        style.configure("TLabelframe.Label", background="#171c26", foreground="#e8ecf3", font=("Segoe UI Semibold", 10))
        style.configure("TNotebook", background="#10131a", borderwidth=0)
        style.configure("TNotebook.Tab", padding=(14, 8))
        style.map("TNotebook.Tab", background=[("selected", "#252d3c")], foreground=[("selected", "#ffffff")])

    def _build_variables(self) -> None:
        self.bot_state = tk.StringVar(value="stopped")
        self.bot_mode = tk.StringVar(value="-")
        self.device_state = tk.StringVar(value="Verificando...")
        self.appium_state = tk.StringVar(value="Verificando...")
        self.current_action = tk.StringVar(value="-")
        self.last_action = tk.StringVar(value="-")
        self.next_action = tk.StringVar(value="-")
        self.last_error = tk.StringVar(value="-")
        self.core_state = tk.StringVar(value="stopped")
        self.core_tick = tk.StringVar(value="inativo")
        self.core_last_tick = tk.StringVar(value="-")
        self.core_result = tk.StringVar(value="-")
        self.core_interval = tk.StringVar(value="-")
        self.provider_state = tk.StringVar(value="-")
        self.account_state = tk.StringVar(value="-")
        self.database_state = tk.StringVar(value="-")
        self.relationship_username = tk.StringVar(value="")
        self.relationship_result = tk.StringVar(value="-")
        self.review_count = tk.StringVar(value="0")
        self.history_count = tk.StringVar(value="0")

        self.min_delay = tk.StringVar(value="60")
        self.max_per_hour = tk.StringVar(value="10")
        self.pause_errors = tk.StringVar(value="2")
        self.pause_minutes = tk.StringVar(value="5")
        self.weekday_start = tk.StringVar(value="0")
        self.weekday_end = tk.StringVar(value="24")
        self.weekend_start = tk.StringVar(value="0")
        self.weekend_end = tk.StringVar(value="24")
        self.warmup_seconds = tk.StringVar(value="")

        self.language = tk.StringVar(value="pt-BR")
        self.tone = tk.StringVar(value="Natural, amigável e relevante")
        self.topics = tk.StringVar(value="tecnologia, produtos, dicas")
        self.max_length = tk.StringVar(value="120")
        self.comment_friends_only = tk.BooleanVar(value=False)
        self.comment_require_context = tk.BooleanVar(value=True)
        self.comment_min_length = tk.StringVar(value="8")
        self.comment_max_emojis = tk.StringVar(value="2")
        self.comment_style = tk.StringVar(value="natural")
        self.comment_preview_only = tk.BooleanVar(value=False)
        self.comment_required_keywords = tk.StringVar(value="")
        self.comment_excluded_keywords = tk.StringVar(value="")
        self.comment_keyword_mode = tk.StringVar(value="any")
        self.comment_required_hashtags = tk.StringVar(value="")
        self.comment_excluded_hashtags = tk.StringVar(value="")
        self.comment_hashtag_mode = tk.StringVar(value="any")
        self.comment_allowed_profiles = tk.StringVar(value="")
        self.comment_blocked_profiles = tk.StringVar(value="")
        self.comment_profile_cooldown = tk.StringVar(value="12")
        self.comment_duplicate_window = tk.StringVar(value="72")
        self.comment_max_profile_day = tk.StringVar(value="2")
        self.comment_avoid_similarity = tk.BooleanVar(value=True)
        self.comment_similarity_threshold = tk.StringVar(value="80")
        self.comment_similarity_count = tk.StringVar(value="20")

        self.follow_exchange_enabled = tk.BooleanVar(value=False)
        self.follow_exchange_phrases = tk.StringVar(value="sigo de volta; sigo todos de volta; segue que sigo; seguindo de volta; apoiando; apoio por aqui; garotas apoiam garotas; follow back; sdv")
        self.follow_exchange_sample_size = tk.StringVar(value="15")
        self.follow_exchange_max_scrolls = tk.StringVar(value="3")
        self.follow_exchange_min_matches = tk.StringVar(value="3")
        self.follow_exchange_confidence = tk.StringVar(value="15")
        self.follow_exchange_comment_enabled = tk.BooleanVar(value=True)
        self.follow_exchange_templates = tk.StringVar(value="Sigo todos de volta 💕; Retribuo todos 🤝; Apoiando por aqui ✨")
        self.follow_exchange_ai_variation = tk.BooleanVar(value=False)
        self.follow_exchange_allow_repeated_templates = tk.BooleanVar(value=True)
        self.follow_exchange_replace_normal = tk.BooleanVar(value=True)
        self.follow_exchange_bypass_filters = tk.BooleanVar(value=True)
        self.follow_exchange_like_comments = tk.BooleanVar(value=False)
        self.follow_exchange_max_likes = tk.StringVar(value="3")
        self.follow_exchange_daily_likes = tk.StringVar(value="10")
        self.follow_exchange_like_matching = tk.BooleanVar(value=True)
        self.follow_exchange_exclude_creator = tk.BooleanVar(value=True)

        self.comment_history_count = tk.StringVar(value="0")

        self.core_enabled = tk.BooleanVar(value=True)
        self.followback_hours = tk.StringVar(value="48")
        self.hashtag_enabled = tk.BooleanVar(value=False)
        self.hashtag_include = tk.StringVar(value="")
        self.hashtag_exclude = tk.StringVar(value="")
        self.hashtag_mode = tk.StringVar(value="any")
        self.hashtag_max = tk.StringVar(value="20")

        self.stat_vars = {
            "scrolls": tk.StringVar(value="0"),
            "likes": tk.StringVar(value="0"),
            "comments": tk.StringVar(value="0"),
            "follows": tk.StringVar(value="0"),
            "shares": tk.StringVar(value="0"),
            "errors": tk.StringVar(value="0"),
            "totalActions": tk.StringVar(value="0"),
            "actionsThisHour": tk.StringVar(value="0"),
            "commentLikes": tk.StringVar(value="0"),
            "followExchangeDetections": tk.StringVar(value="0"),
            "commentSkips": tk.StringVar(value="0"),
        }

    def _build_ui(self) -> None:
        root = ttk.Frame(self)
        root.pack(fill="both", expand=True, padx=16, pady=14)

        header = ttk.Frame(root)
        header.pack(fill="x")

        ttk.Label(header, text="TikTok Bot", style="Title.TLabel").pack(side="left")
        ttk.Label(
            header,
            text="Android real • Appium/ADB • painel standalone",
            style="HeaderMuted.TLabel",
        ).pack(side="left", padx=(14, 0), pady=(5, 0))

        ttk.Button(header, text="Salvar configuração", command=self.save_config).pack(side="right")

        status_strip = ttk.Frame(root, style="Card.TFrame")
        status_strip.pack(fill="x", pady=(12, 10))

        self._status_item(status_strip, "BOT", self.bot_state, 0)
        self._status_item(status_strip, "MODO", self.bot_mode, 1)
        self._status_item(status_strip, "CELULAR / ADB", self.device_state, 2)
        self._status_item(status_strip, "APPIUM", self.appium_state, 3)
        self._status_item(status_strip, "PROVIDER", self.provider_state, 4)
        self._status_item(status_strip, "CORE", self.core_state, 5)
        self._status_item(status_strip, "BANCO", self.database_state, 6)

        controls = ttk.Frame(root, style="Card.TFrame")
        controls.pack(fill="x", pady=(0, 10), ipady=7)

        ttk.Button(controls, text="▶ Iniciar TESTE", command=lambda: self.start_bot("test")).pack(side="left", padx=(10, 6))
        ttk.Button(controls, text="▶ Iniciar REAL", command=lambda: self.start_bot("real")).pack(side="left", padx=6)
        ttk.Button(controls, text="⏸ Pausar", command=lambda: self.send_command("pause")).pack(side="left", padx=6)
        ttk.Button(controls, text="▶ Retomar", command=lambda: self.send_command("resume")).pack(side="left", padx=6)
        ttk.Button(controls, text="■ Parar", command=lambda: self.send_command("stop")).pack(side="left", padx=6)
        ttk.Button(controls, text="↻ Atualizar conexões", command=self.refresh_connections).pack(side="right", padx=10)

        notebook = ttk.Notebook(root)
        notebook.pack(fill="both", expand=True)

        self.tab_control = ttk.Frame(notebook, style="Card.TFrame")
        self.tab_actions = ttk.Frame(notebook, style="Card.TFrame")
        self.tab_config = ttk.Frame(notebook, style="Card.TFrame")
        self.tab_automation = ttk.Frame(notebook, style="Card.TFrame")
        self.tab_reviews = ttk.Frame(notebook, style="Card.TFrame")
        self.tab_history = ttk.Frame(notebook, style="Card.TFrame")

        notebook.add(self.tab_control, text="Controle e logs")
        notebook.add(self.tab_actions, text="Ações")
        notebook.add(self.tab_config, text="Conteúdo e limites")
        notebook.add(self.tab_automation, text="Follow-back e hashtags")
        notebook.add(self.tab_reviews, text="Revisões manuais")
        notebook.add(self.tab_history, text="Histórico")

        self._build_control_tab()
        self._build_actions_tab()
        self._build_config_tab()
        self._build_automation_tab()
        self._build_reviews_tab()
        self._build_history_tab()

    def _status_item(self, parent: ttk.Frame, title: str, variable: tk.StringVar, column: int) -> None:
        frame = ttk.Frame(parent, style="Card.TFrame")
        frame.grid(row=0, column=column, sticky="nsew", padx=12, pady=8)
        parent.columnconfigure(column, weight=1)
        ttk.Label(frame, text=title, style="Muted.TLabel").pack(anchor="w")
        ttk.Label(frame, textvariable=variable, style="Status.TLabel").pack(anchor="w", pady=(2, 0))

    def _build_control_tab(self) -> None:
        self.tab_control.columnconfigure(0, weight=1)
        self.tab_control.columnconfigure(1, weight=1)
        self.tab_control.rowconfigure(2, weight=1)

        runtime = ttk.LabelFrame(self.tab_control, text="Execução")
        runtime.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)

        labels = (
            ("Conta / agente", self.account_state),
            ("Ação atual", self.current_action),
            ("Última ação", self.last_action),
            ("Próxima ação", self.next_action),
            ("Último erro", self.last_error),
        )
        for row, (title, var) in enumerate(labels):
            ttk.Label(runtime, text=title, style="Muted.TLabel").grid(row=row, column=0, sticky="w", padx=10, pady=5)
            ttk.Label(runtime, textvariable=var, style="Card.TLabel").grid(row=row, column=1, sticky="w", padx=10, pady=5)

        core = ttk.LabelFrame(self.tab_control, text="Automation Core / follow-back")
        core.grid(row=0, column=1, sticky="nsew", padx=10, pady=10)

        core_labels = (
            ("Estado", self.core_state),
            ("Tick", self.core_tick),
            ("Intervalo", self.core_interval),
            ("Último tick", self.core_last_tick),
            ("Resultado", self.core_result),
        )
        for row, (title, var) in enumerate(core_labels):
            ttk.Label(core, text=title, style="Muted.TLabel").grid(row=row, column=0, sticky="w", padx=10, pady=5)
            ttk.Label(core, textvariable=var, style="Card.TLabel").grid(row=row, column=1, sticky="w", padx=10, pady=5)

        stats = ttk.LabelFrame(self.tab_control, text="Contadores")
        stats.grid(row=1, column=0, columnspan=2, sticky="ew", padx=10, pady=(0, 10))

        stat_titles = (
            ("Vídeos/scroll", "scrolls"),
            ("Curtidas", "likes"),
            ("Comentários", "comments"),
            ("Seguidos", "follows"),
            ("Likes comentários", "commentLikes"),
            ("Troca-follow detectada", "followExchangeDetections"),
            ("Comentários ignorados", "commentSkips"),
            ("Erros", "errors"),
            ("Total", "totalActions"),
            ("Nesta hora", "actionsThisHour"),
            ("Shares", "shares"),
        )
        for idx, (title, key) in enumerate(stat_titles):
            col = idx % 4
            row = (idx // 4) * 2
            ttk.Label(stats, text=title, style="Muted.TLabel").grid(row=row, column=col, sticky="w", padx=12, pady=(7, 0))
            ttk.Label(stats, textvariable=self.stat_vars[key], style="Card.TLabel").grid(row=row + 1, column=col, sticky="w", padx=12, pady=(0, 7))
            stats.columnconfigure(col, weight=1)

        logs_frame = ttk.LabelFrame(self.tab_control, text="Logs ao vivo")
        logs_frame.grid(row=2, column=0, columnspan=2, sticky="nsew", padx=10, pady=(0, 10))
        logs_frame.rowconfigure(0, weight=1)
        logs_frame.columnconfigure(0, weight=1)

        self.logs_text = tk.Text(
            logs_frame,
            bg="#0b0e14",
            fg="#d7deea",
            insertbackground="#ffffff",
            relief="flat",
            wrap="word",
            font=("Cascadia Mono", 9),
        )
        self.logs_text.grid(row=0, column=0, sticky="nsew", padx=(8, 0), pady=8)
        scroll = ttk.Scrollbar(logs_frame, orient="vertical", command=self.logs_text.yview)
        scroll.grid(row=0, column=1, sticky="ns", pady=8, padx=(0, 8))
        self.logs_text.configure(yscrollcommand=scroll.set)

    def _build_actions_tab(self) -> None:
        ttk.Label(
            self.tab_actions,
            text="Escolha as ações do bot e seus limites individuais.",
            style="Card.TLabel",
        ).pack(anchor="w", padx=14, pady=(14, 8))

        table = ttk.Frame(self.tab_actions, style="Card.TFrame")
        table.pack(fill="x", padx=14, pady=6)

        headers = ("Ação", "Ativa", "Intervalo (min)", "Limite diário")
        for col, title in enumerate(headers):
            ttk.Label(table, text=title, style="Muted.TLabel").grid(row=0, column=col, sticky="w", padx=8, pady=6)

        for row, (key, label) in enumerate(ACTIONS, start=1):
            enabled = tk.BooleanVar(value=False)
            interval = tk.StringVar(value="1")
            daily = tk.StringVar(value="20")

            self.action_vars[key] = {
                "enabled": enabled,
                "intervalMinutes": interval,
                "dailyLimit": daily,
            }

            ttk.Label(table, text=label, style="Card.TLabel").grid(row=row, column=0, sticky="w", padx=8, pady=7)
            ttk.Checkbutton(table, variable=enabled).grid(row=row, column=1, sticky="w", padx=8)
            ttk.Entry(table, textvariable=interval, width=14).grid(row=row, column=2, sticky="w", padx=8)
            ttk.Entry(table, textvariable=daily, width=14).grid(row=row, column=3, sticky="w", padx=8)

        ttk.Label(
            self.tab_actions,
            text=(
                "No modo TESTE, curtidas/comentários/follows são simulados. "
                "No modo REAL, as ações habilitadas são executadas no aparelho."
            ),
            style="Muted.TLabel",
            wraplength=900,
        ).pack(anchor="w", padx=14, pady=16)

    def _build_config_tab(self) -> None:
        outer = ttk.Frame(self.tab_config, style="Card.TFrame")
        outer.pack(fill="both", expand=True, padx=12, pady=12)
        outer.columnconfigure(0, weight=1)
        outer.columnconfigure(1, weight=1)

        safety = ttk.LabelFrame(outer, text="Segurança e ritmo")
        safety.grid(row=0, column=0, sticky="nsew", padx=6, pady=6)

        self._entry_row(safety, 0, "Delay mínimo global (s)", self.min_delay)
        self._entry_row(safety, 1, "Máximo de ações/hora", self.max_per_hour)
        self._entry_row(safety, 2, "Pausar após N erros", self.pause_errors)
        self._entry_row(safety, 3, "Pausa por erro (min)", self.pause_minutes)
        self._entry_row(safety, 4, "Warmup (s, vazio = padrão)", self.warmup_seconds)

        hours = ttk.LabelFrame(outer, text="Horário ativo")
        hours.grid(row=1, column=0, sticky="nsew", padx=6, pady=6)
        self._entry_row(hours, 0, "Seg-Sex início", self.weekday_start)
        self._entry_row(hours, 1, "Seg-Sex fim", self.weekday_end)
        self._entry_row(hours, 2, "Fim de semana início", self.weekend_start)
        self._entry_row(hours, 3, "Fim de semana fim", self.weekend_end)

        comment_box = ttk.LabelFrame(outer, text="Política de comentários")
        comment_box.grid(row=0, column=1, rowspan=2, sticky="nsew", padx=6, pady=6)
        comment_box.rowconfigure(0, weight=1)
        comment_box.columnconfigure(0, weight=1)

        comment_tabs = ttk.Notebook(comment_box)
        comment_tabs.grid(row=0, column=0, sticky="nsew", padx=6, pady=6)

        general = ttk.Frame(comment_tabs, style="Card.TFrame")
        filters = ttk.Frame(comment_tabs, style="Card.TFrame")
        exchange = ttk.Frame(comment_tabs, style="Card.TFrame")

        comment_tabs.add(general, text="Comentários")
        comment_tabs.add(filters, text="Filtros e repetição")
        comment_tabs.add(exchange, text="Troca de follow")

        self._entry_row(general, 0, "Idioma", self.language)
        self._entry_row(general, 1, "Tom", self.tone)
        self._entry_row(general, 2, "Tópicos (vírgula)", self.topics)
        self._entry_row(general, 3, "Mín. caracteres", self.comment_min_length)
        self._entry_row(general, 4, "Máx. caracteres", self.max_length)
        self._entry_row(general, 5, "Máx. emojis", self.comment_max_emojis)

        ttk.Label(general, text="Estilo", style="Muted.TLabel").grid(row=6, column=0, sticky="w", padx=10, pady=6)
        ttk.Combobox(
            general,
            textvariable=self.comment_style,
            values=("natural", "short", "curious", "question", "informative", "light_humor"),
            state="readonly",
            width=24,
        ).grid(row=6, column=1, sticky="ew", padx=10, pady=6)

        ttk.Checkbutton(
            general,
            text="Exigir legenda/hashtags reais antes de comentário normal",
            variable=self.comment_require_context,
        ).grid(row=7, column=0, columnspan=2, sticky="w", padx=10, pady=(8, 3))

        ttk.Checkbutton(
            general,
            text="Comentar somente em perfis amigos (ambos se seguem)",
            variable=self.comment_friends_only,
        ).grid(row=8, column=0, columnspan=2, sticky="w", padx=10, pady=3)

        ttk.Checkbutton(
            general,
            text="Somente prévia: nunca publicar/curtir comentários mesmo em REAL",
            variable=self.comment_preview_only,
        ).grid(row=9, column=0, columnspan=2, sticky="w", padx=10, pady=3)

        ttk.Checkbutton(
            general,
            text="Evitar comentários parecidos com os últimos publicados",
            variable=self.comment_avoid_similarity,
        ).grid(row=10, column=0, columnspan=2, sticky="w", padx=10, pady=3)

        self._entry_row(general, 11, "Similaridade máx. (%)", self.comment_similarity_threshold)
        self._entry_row(general, 12, "Comparar últimos N comentários", self.comment_similarity_count)

        ttk.Label(
            general,
            text="No TESTE, o texto final aparece no log e nada é publicado.",
            style="Muted.TLabel",
            wraplength=470,
        ).grid(row=13, column=0, columnspan=2, sticky="w", padx=10, pady=10)

        self._entry_row(filters, 0, "Palavras obrigatórias (vírgula)", self.comment_required_keywords)
        ttk.Label(filters, text="Regra palavras", style="Muted.TLabel").grid(row=1, column=0, sticky="w", padx=10, pady=6)
        ttk.Combobox(filters, textvariable=self.comment_keyword_mode, values=("any", "all"), state="readonly", width=16).grid(row=1, column=1, sticky="w", padx=10, pady=6)
        self._entry_row(filters, 2, "Palavras/assuntos proibidos", self.comment_excluded_keywords)
        self._entry_row(filters, 3, "Hashtags obrigatórias", self.comment_required_hashtags)
        ttk.Label(filters, text="Regra hashtags", style="Muted.TLabel").grid(row=4, column=0, sticky="w", padx=10, pady=6)
        ttk.Combobox(filters, textvariable=self.comment_hashtag_mode, values=("any", "all"), state="readonly", width=16).grid(row=4, column=1, sticky="w", padx=10, pady=6)
        self._entry_row(filters, 5, "Hashtags proibidas", self.comment_excluded_hashtags)
        self._entry_row(filters, 6, "Perfis permitidos (@, vírgula)", self.comment_allowed_profiles)
        self._entry_row(filters, 7, "Perfis bloqueados (@, vírgula)", self.comment_blocked_profiles)
        self._entry_row(filters, 8, "Cooldown por perfil (h)", self.comment_profile_cooldown)
        self._entry_row(filters, 9, "Não repetir vídeo por (h)", self.comment_duplicate_window)
        self._entry_row(filters, 10, "Máx. comentários/perfil/dia", self.comment_max_profile_day)

        ttk.Label(
            filters,
            text="Lista permitida vazia = qualquer perfil. Cooldown/duplicidade usam histórico local em .runtime.",
            style="Muted.TLabel",
            wraplength=470,
        ).grid(row=11, column=0, columnspan=2, sticky="w", padx=10, pady=10)

        ttk.Checkbutton(
            exchange,
            text="Ativar detector de vídeos de troca de follow / apoio mútuo",
            variable=self.follow_exchange_enabled,
        ).grid(row=0, column=0, columnspan=2, sticky="w", padx=10, pady=(8, 4))

        self._entry_row(exchange, 1, "Frases indicadoras (;)", self.follow_exchange_phrases)
        self._entry_row(exchange, 2, "Comentários para analisar", self.follow_exchange_sample_size)
        self._entry_row(exchange, 3, "Máx. rolagens dos comentários", self.follow_exchange_max_scrolls)
        self._entry_row(exchange, 4, "Mín. comentários com sinais", self.follow_exchange_min_matches)
        self._entry_row(exchange, 5, "Confiança mínima (%)", self.follow_exchange_confidence)

        ttk.Checkbutton(exchange, text="Comentar quando detectar", variable=self.follow_exchange_comment_enabled).grid(row=6, column=0, columnspan=2, sticky="w", padx=10, pady=3)
        self._entry_row(exchange, 7, "Comentários especiais (;)", self.follow_exchange_templates)
        ttk.Checkbutton(exchange, text="Usar IA para variar o comentário especial", variable=self.follow_exchange_ai_variation).grid(row=8, column=0, columnspan=2, sticky="w", padx=10, pady=3)
        ttk.Checkbutton(exchange, text="Permitir reutilizar comentários especiais em outros vídeos", variable=self.follow_exchange_allow_repeated_templates).grid(row=9, column=0, columnspan=2, sticky="w", padx=10, pady=3)
        ttk.Checkbutton(exchange, text="Substituir comentário normal quando detectar", variable=self.follow_exchange_replace_normal).grid(row=10, column=0, columnspan=2, sticky="w", padx=10, pady=3)
        ttk.Checkbutton(exchange, text="Ignorar filtros normais de tema/hashtag neste tipo", variable=self.follow_exchange_bypass_filters).grid(row=11, column=0, columnspan=2, sticky="w", padx=10, pady=3)

        ttk.Checkbutton(exchange, text="Curtir comentários deste vídeo", variable=self.follow_exchange_like_comments).grid(row=12, column=0, columnspan=2, sticky="w", padx=10, pady=(8, 3))
        self._entry_row(exchange, 13, "Máx. likes em comentários/vídeo", self.follow_exchange_max_likes)
        self._entry_row(exchange, 14, "Máx. likes em comentários/dia", self.follow_exchange_daily_likes)
        ttk.Checkbutton(exchange, text="Curtir só comentários que tenham sinais configurados", variable=self.follow_exchange_like_matching).grid(row=15, column=0, columnspan=2, sticky="w", padx=10, pady=3)
        ttk.Checkbutton(exchange, text="Não curtir comentário do criador quando identificável", variable=self.follow_exchange_exclude_creator).grid(row=16, column=0, columnspan=2, sticky="w", padx=10, pady=3)

        ttk.Label(
            exchange,
            text="A detecção usa comentários visíveis. O recurso fica desligado por padrão; no TESTE apenas registra o que faria.",
            style="Muted.TLabel",
            wraplength=470,
        ).grid(row=17, column=0, columnspan=2, sticky="w", padx=10, pady=10)

    def _build_automation_tab(self) -> None:
        core = ttk.LabelFrame(self.tab_automation, text="Follow-back / relacionamento")
        core.pack(fill="x", padx=14, pady=(14, 8))

        ttk.Checkbutton(core, text="Ativar Automation Core", variable=self.core_enabled).grid(row=0, column=0, columnspan=2, sticky="w", padx=10, pady=8)
        self._entry_row(core, 1, "Checar follow-back após (horas)", self.followback_hours)

        ttk.Label(
            core,
            text=(
                "Quando um FOLLOW real é confirmado, o bot registra a conta e agenda a checagem. "
                "Se não houver follow-back, UNFOLLOW entra somente em revisão manual; "
                "o scheduler não executa unfollow automaticamente."
            ),
            style="Muted.TLabel",
            wraplength=920,
        ).grid(row=2, column=0, columnspan=2, sticky="w", padx=10, pady=(4, 10))

        hashtag = ttk.LabelFrame(self.tab_automation, text="Filtros por hashtag")
        hashtag.pack(fill="x", padx=14, pady=8)

        ttk.Checkbutton(hashtag, text="Ativar filtro de descoberta", variable=self.hashtag_enabled).grid(row=0, column=0, columnspan=2, sticky="w", padx=10, pady=8)
        self._entry_row(hashtag, 1, "Incluir hashtags (vírgula)", self.hashtag_include)
        self._entry_row(hashtag, 2, "Excluir hashtags (vírgula)", self.hashtag_exclude)

        ttk.Label(hashtag, text="Regra de inclusão", style="Muted.TLabel").grid(row=3, column=0, sticky="w", padx=10, pady=6)
        ttk.Combobox(
            hashtag,
            textvariable=self.hashtag_mode,
            values=("any", "all"),
            state="readonly",
            width=18,
        ).grid(row=3, column=1, sticky="w", padx=10, pady=6)
        self._entry_row(hashtag, 4, "Máx. candidatos/ciclo", self.hashtag_max)

        ttk.Label(
            hashtag,
            text=(
                "ANY = basta uma hashtag incluída. ALL = todas as hashtags incluídas precisam estar presentes. "
                "Hashtags excluídas sempre rejeitam o candidato."
            ),
            style="Muted.TLabel",
            wraplength=920,
        ).grid(row=5, column=0, columnspan=2, sticky="w", padx=10, pady=(4, 10))

        tools = ttk.LabelFrame(self.tab_automation, text="Ferramentas read-only / core")
        tools.pack(fill="x", padx=14, pady=8)

        ttk.Label(tools, text="Verificar @username", style="Muted.TLabel").grid(row=0, column=0, sticky="w", padx=10, pady=8)
        ttk.Entry(tools, textvariable=self.relationship_username, width=28).grid(row=0, column=1, sticky="w", padx=10, pady=8)
        ttk.Button(tools, text="Checar relacionamento", command=self.check_relationship).grid(row=0, column=2, sticky="w", padx=8, pady=8)
        ttk.Button(tools, text="Executar tick agora", command=lambda: self.send_command("run_core_once")).grid(row=0, column=3, sticky="w", padx=8, pady=8)

        ttk.Label(tools, text="Resultado", style="Muted.TLabel").grid(row=1, column=0, sticky="nw", padx=10, pady=(2, 10))
        ttk.Label(tools, textvariable=self.relationship_result, style="Card.TLabel", wraplength=760).grid(row=1, column=1, columnspan=3, sticky="w", padx=10, pady=(2, 10))

        ttk.Label(
            tools,
            text=(
                "A checagem por username é somente leitura: abre o perfil exato, observa a relação e retorna ao feed. "
                "Não segue, deixa de seguir, curte, comenta ou envia mensagem."
            ),
            style="Muted.TLabel",
            wraplength=920,
        ).grid(row=2, column=0, columnspan=4, sticky="w", padx=10, pady=(0, 10))

    def _build_reviews_tab(self) -> None:
        header = ttk.Frame(self.tab_reviews, style="Card.TFrame")
        header.pack(fill="x", padx=12, pady=(12, 6))

        ttk.Label(header, text="Pendentes:", style="Muted.TLabel").pack(side="left")
        ttk.Label(header, textvariable=self.review_count, style="Card.TLabel").pack(side="left", padx=(5, 16))
        ttk.Button(header, text="↻ Atualizar", command=lambda: self.send_command("refresh_persistent")).pack(side="right")

        columns = ("kind", "username", "reason", "query", "hashtags", "created")
        self.review_tree = ttk.Treeview(self.tab_reviews, columns=columns, show="headings", height=16)

        headings = {
            "kind": "Tipo",
            "username": "Usuário",
            "reason": "Motivo",
            "query": "Busca",
            "hashtags": "Hashtags",
            "created": "Criado em",
        }
        widths = {
            "kind": 100,
            "username": 160,
            "reason": 220,
            "query": 150,
            "hashtags": 250,
            "created": 180,
        }

        for column in columns:
            self.review_tree.heading(column, text=headings[column])
            self.review_tree.column(column, width=widths[column], anchor="w")

        self.review_tree.pack(fill="both", expand=True, padx=12, pady=6)

        buttons = ttk.Frame(self.tab_reviews, style="Card.TFrame")
        buttons.pack(fill="x", padx=12, pady=(4, 12))

        ttk.Button(buttons, text="Aprovar DISCOVERY", command=lambda: self.review_selected("approve_discovery")).pack(side="left", padx=(0, 6))
        ttk.Button(buttons, text="Rejeitar DISCOVERY", command=lambda: self.review_selected("reject_discovery")).pack(side="left", padx=6)
        ttk.Button(buttons, text="Cancelar UNFOLLOW", command=lambda: self.review_selected("cancel_unfollow")).pack(side="left", padx=6)

        ttk.Label(
            buttons,
            text=(
                "Aprovar DISCOVERY só registra a decisão humana. Não cria Follow/Like/Comment/Share/DM. "
                "UNFOLLOW nunca é executado automaticamente; neste painel ele só pode ser cancelado."
            ),
            style="Muted.TLabel",
            wraplength=680,
        ).pack(side="right", padx=8)

    def _build_history_tab(self) -> None:
        header = ttk.Frame(self.tab_history, style="Card.TFrame")
        header.pack(fill="x", padx=12, pady=(12, 6))

        ttk.Label(header, text="Ações persistidas:", style="Muted.TLabel").pack(side="left")
        ttk.Label(header, textvariable=self.history_count, style="Card.TLabel").pack(side="left", padx=(5, 16))
        ttk.Button(header, text="↻ Atualizar", command=lambda: self.send_command("refresh_persistent")).pack(side="right")

        actions_frame = ttk.LabelFrame(self.tab_history, text="Histórico recente de ações")
        actions_frame.pack(fill="both", expand=True, padx=12, pady=6)

        action_columns = ("type", "status", "username", "provider", "updated", "error")
        self.history_tree = ttk.Treeview(actions_frame, columns=action_columns, show="headings", height=9)

        action_headings = {
            "type": "Ação",
            "status": "Status",
            "username": "Usuário",
            "provider": "Provider",
            "updated": "Atualizado",
            "error": "Erro",
        }
        action_widths = {
            "type": 150,
            "status": 100,
            "username": 160,
            "provider": 90,
            "updated": 180,
            "error": 380,
        }

        for column in action_columns:
            self.history_tree.heading(column, text=action_headings[column])
            self.history_tree.column(column, width=action_widths[column], anchor="w")

        self.history_tree.pack(fill="both", expand=True, padx=6, pady=6)

        relations_frame = ttk.LabelFrame(self.tab_history, text="Relacionamentos persistidos")
        relations_frame.pack(fill="both", expand=True, padx=12, pady=(6, 12))

        relation_columns = ("username", "state", "follows_us", "followed_by_us", "protected", "checked")
        self.relationship_tree = ttk.Treeview(relations_frame, columns=relation_columns, show="headings", height=8)

        relation_headings = {
            "username": "Usuário",
            "state": "Relação",
            "follows_us": "Segue nós",
            "followed_by_us": "Seguimos",
            "protected": "Protegido",
            "checked": "Última checagem",
        }
        relation_widths = {
            "username": 190,
            "state": 130,
            "follows_us": 100,
            "followed_by_us": 100,
            "protected": 100,
            "checked": 210,
        }

        for column in relation_columns:
            self.relationship_tree.heading(column, text=relation_headings[column])
            self.relationship_tree.column(column, width=relation_widths[column], anchor="w")

        self.relationship_tree.pack(fill="both", expand=True, padx=6, pady=6)

        comments_frame = ttk.LabelFrame(self.tab_history, text="Histórico local de comentários")
        comments_frame.pack(fill="both", expand=True, padx=12, pady=(6, 12))

        comment_columns = ("time", "kind", "status", "username", "comment")
        self.comment_history_tree = ttk.Treeview(comments_frame, columns=comment_columns, show="headings", height=6)

        comment_headings = {
            "time": "Data/hora",
            "kind": "Tipo",
            "status": "Status",
            "username": "Perfil",
            "comment": "Comentário / alvo",
        }
        comment_widths = {
            "time": 180,
            "kind": 130,
            "status": 100,
            "username": 160,
            "comment": 560,
        }

        for column in comment_columns:
            self.comment_history_tree.heading(column, text=comment_headings[column])
            self.comment_history_tree.column(column, width=comment_widths[column], anchor="w")

        self.comment_history_tree.pack(fill="both", expand=True, padx=6, pady=6)

    def _entry_row(self, parent: ttk.Widget, row: int, label: str, variable: tk.StringVar) -> None:
        ttk.Label(parent, text=label, style="Muted.TLabel").grid(row=row, column=0, sticky="w", padx=10, pady=6)
        ttk.Entry(parent, textvariable=variable, width=28).grid(row=row, column=1, sticky="ew", padx=10, pady=6)
        parent.columnconfigure(1, weight=1)

    @staticmethod
    def _csv(value: str) -> list[str]:
        return [item.strip().lstrip("#") for item in value.split(",") if item.strip()]

    @staticmethod
    def _profiles(value: str) -> list[str]:
        return [item.strip().lstrip("@") for item in value.split(",") if item.strip()]

    @staticmethod
    def _semicolon(value: str) -> list[str]:
        return [item.strip() for item in value.split(";") if item.strip()]

    @staticmethod
    def _int(value: str, name: str, minimum: int, maximum: int | None = None) -> int:
        try:
            number = int(value)
        except ValueError as exc:
            raise ValueError(f"{name}: informe um número inteiro.") from exc

        if number < minimum:
            raise ValueError(f"{name}: mínimo {minimum}.")

        if maximum is not None and number > maximum:
            raise ValueError(f"{name}: máximo {maximum}.")

        return number

    def load_config(self) -> None:
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            messagebox.showerror("Configuração", f"Não foi possível abrir {CONFIG_PATH}\n\n{exc}")
            return

        for key, _ in ACTIONS:
            action = data.get("actions", {}).get(key, {})
            vars_ = self.action_vars.get(key)
            if vars_:
                vars_["enabled"].set(bool(action.get("enabled", False)))
                vars_["intervalMinutes"].set(str(action.get("intervalMinutes", 1)))
                vars_["dailyLimit"].set(str(action.get("dailyLimit", 20)))

        safety = data.get("safety", {})
        self.min_delay.set(str(safety.get("minDelaySeconds", 60)))
        self.max_per_hour.set(str(safety.get("maxActionsPerHour", 10)))
        self.pause_errors.set(str(safety.get("pauseOnErrorCount", 2)))
        self.pause_minutes.set(str(safety.get("pauseDurationMinutes", 5)))

        warmup = data.get("warmupSeconds")
        self.warmup_seconds.set("" if warmup is None else str(warmup))

        hours = data.get("activeHours", {})
        weekday = hours.get("weekday", {})
        weekend = hours.get("weekend", {})
        self.weekday_start.set(str(weekday.get("start", 0)))
        self.weekday_end.set(str(weekday.get("end", 24)))
        self.weekend_start.set(str(weekend.get("start", 0)))
        self.weekend_end.set(str(weekend.get("end", 24)))

        content = data.get("content", {})
        self.language.set(str(content.get("language", "pt-BR")))
        self.tone.set(str(content.get("tone", "Natural, amigável e relevante")))
        self.topics.set(", ".join(content.get("topics", ["tecnologia", "produtos", "dicas"])))
        self.max_length.set(str(content.get("maxLength", 120)))
        comment_policy = content.get("commentPolicy", {})
        self.comment_friends_only.set(bool(comment_policy.get("friendsOnly", False)))
        self.comment_require_context.set(bool(comment_policy.get("requireVideoContext", True)))
        self.comment_min_length.set(str(comment_policy.get("minLength", 8)))
        self.comment_max_emojis.set(str(comment_policy.get("maxEmojis", 2)))
        self.comment_style.set(str(comment_policy.get("stylePreset", "natural")))
        self.comment_preview_only.set(bool(comment_policy.get("previewOnly", False)))
        self.comment_required_keywords.set(", ".join(comment_policy.get("requiredKeywords", [])))
        self.comment_excluded_keywords.set(", ".join(comment_policy.get("excludedKeywords", [])))
        self.comment_keyword_mode.set(str(comment_policy.get("keywordMatchMode", "any")))
        self.comment_required_hashtags.set(", ".join(comment_policy.get("requiredHashtags", [])))
        self.comment_excluded_hashtags.set(", ".join(comment_policy.get("excludedHashtags", [])))
        self.comment_hashtag_mode.set(str(comment_policy.get("hashtagMatchMode", "any")))
        self.comment_allowed_profiles.set(", ".join(comment_policy.get("allowedProfiles", [])))
        self.comment_blocked_profiles.set(", ".join(comment_policy.get("blockedProfiles", [])))
        self.comment_profile_cooldown.set(str(comment_policy.get("profileCooldownHours", 12)))
        self.comment_duplicate_window.set(str(comment_policy.get("duplicateVideoWindowHours", 72)))
        self.comment_max_profile_day.set(str(comment_policy.get("maxCommentsPerProfilePerDay", 2)))
        self.comment_avoid_similarity.set(bool(comment_policy.get("avoidRecentCommentSimilarity", True)))
        self.comment_similarity_threshold.set(str(round(float(comment_policy.get("similarityThreshold", 0.8)) * 100)))
        self.comment_similarity_count.set(str(comment_policy.get("recentCommentComparisonCount", 20)))

        exchange = comment_policy.get("followExchange", {})
        self.follow_exchange_enabled.set(bool(exchange.get("enabled", False)))
        self.follow_exchange_phrases.set("; ".join(exchange.get("indicatorPhrases", ["sigo de volta", "apoiando", "garotas apoiam garotas"])))
        self.follow_exchange_sample_size.set(str(exchange.get("sampleSize", 15)))
        self.follow_exchange_max_scrolls.set(str(exchange.get("maxScrolls", 3)))
        self.follow_exchange_min_matches.set(str(exchange.get("minMatchedComments", 3)))
        self.follow_exchange_confidence.set(str(round(float(exchange.get("minConfidence", 0.15)) * 100)))
        self.follow_exchange_comment_enabled.set(bool(exchange.get("commentEnabled", True)))
        self.follow_exchange_templates.set("; ".join(exchange.get("commentTemplates", ["Sigo todos de volta 💕"])))
        self.follow_exchange_ai_variation.set(bool(exchange.get("useAiVariation", False)))
        self.follow_exchange_allow_repeated_templates.set(bool(exchange.get("allowRepeatedTemplates", True)))
        self.follow_exchange_replace_normal.set(bool(exchange.get("replaceNormalComment", True)))
        self.follow_exchange_bypass_filters.set(bool(exchange.get("bypassNormalContentFilters", True)))
        self.follow_exchange_like_comments.set(bool(exchange.get("likeCommentsEnabled", False)))
        self.follow_exchange_max_likes.set(str(exchange.get("maxCommentLikesPerVideo", 3)))
        self.follow_exchange_daily_likes.set(str(exchange.get("dailyCommentLikeLimit", 10)))
        self.follow_exchange_like_matching.set(bool(exchange.get("likeOnlyMatchingSignals", True)))
        self.follow_exchange_exclude_creator.set(bool(exchange.get("excludeCreatorComments", True)))

        auto = data.get("automationCore", {})
        self.core_enabled.set(bool(auto.get("enabled", True)))
        self.followback_hours.set(str(auto.get("followBackCheckHours", 48)))
        hashtags = auto.get("hashtags", {})
        self.hashtag_enabled.set(bool(hashtags.get("enabled", False)))
        self.hashtag_include.set(", ".join(hashtags.get("include", [])))
        self.hashtag_exclude.set(", ".join(hashtags.get("exclude", [])))
        self.hashtag_mode.set(str(hashtags.get("matchMode", "any")))
        self.hashtag_max.set(str(hashtags.get("maxCandidatesPerCycle", 20)))

    def save_config(self, quiet: bool = False) -> bool:
        try:
            if CONFIG_PATH.exists():
                data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            else:
                data = {}

            actions: dict[str, dict[str, object]] = {}
            enabled_count = 0

            for key, _ in ACTIONS:
                vars_ = self.action_vars[key]
                enabled = bool(vars_["enabled"].get())
                if enabled:
                    enabled_count += 1

                actions[key] = {
                    "enabled": enabled,
                    "intervalMinutes": self._int(str(vars_["intervalMinutes"].get()), f"{key} intervalo", 1),
                    "dailyLimit": self._int(str(vars_["dailyLimit"].get()), f"{key} limite diário", 0),
                }

            if enabled_count == 0:
                raise ValueError("Ative pelo menos uma ação.")

            data["actions"] = actions
            data["safety"] = {
                "minDelaySeconds": self._int(self.min_delay.get(), "Delay mínimo", 1),
                "maxActionsPerHour": self._int(self.max_per_hour.get(), "Máximo por hora", 1),
                "pauseOnErrorCount": self._int(self.pause_errors.get(), "Erros antes da pausa", 1),
                "pauseDurationMinutes": self._int(self.pause_minutes.get(), "Pausa por erro", 1),
            }
            data["activeHours"] = {
                "weekday": {
                    "start": self._int(self.weekday_start.get(), "Seg-Sex início", 0, 23),
                    "end": self._int(self.weekday_end.get(), "Seg-Sex fim", 1, 24),
                },
                "weekend": {
                    "start": self._int(self.weekend_start.get(), "Fim de semana início", 0, 23),
                    "end": self._int(self.weekend_end.get(), "Fim de semana fim", 1, 24),
                },
            }

            if data["activeHours"]["weekday"]["start"] >= data["activeHours"]["weekday"]["end"]:
                raise ValueError("Seg-Sex: o horário inicial deve ser menor que o final.")

            if data["activeHours"]["weekend"]["start"] >= data["activeHours"]["weekend"]["end"]:
                raise ValueError("Fim de semana: o horário inicial deve ser menor que o final.")

            topics = self._csv(self.topics.get())
            if not topics:
                raise ValueError("Informe pelo menos um tópico para comentários.")

            data["content"] = {
                "tone": self.tone.get().strip() or "Natural, amigável e relevante",
                "language": self.language.get().strip() or "pt-BR",
                "topics": topics,
                "maxLength": self._int(self.max_length.get(), "Máx. caracteres", 20, 500),
                "commentPolicy": {
                    "friendsOnly": bool(self.comment_friends_only.get()),
                    "requireVideoContext": bool(self.comment_require_context.get()),
                    "minLength": self._int(self.comment_min_length.get(), "Mín. caracteres", 1, 500),
                    "maxEmojis": self._int(self.comment_max_emojis.get(), "Máx. emojis", 0, 10),
                    "stylePreset": self.comment_style.get() if self.comment_style.get() in ("natural", "short", "curious", "question", "informative", "light_humor") else "natural",
                    "previewOnly": bool(self.comment_preview_only.get()),
                    "requiredKeywords": self._csv(self.comment_required_keywords.get()),
                    "excludedKeywords": self._csv(self.comment_excluded_keywords.get()),
                    "keywordMatchMode": self.comment_keyword_mode.get() if self.comment_keyword_mode.get() in ("any", "all") else "any",
                    "requiredHashtags": self._csv(self.comment_required_hashtags.get()),
                    "excludedHashtags": self._csv(self.comment_excluded_hashtags.get()),
                    "hashtagMatchMode": self.comment_hashtag_mode.get() if self.comment_hashtag_mode.get() in ("any", "all") else "any",
                    "allowedProfiles": self._profiles(self.comment_allowed_profiles.get()),
                    "blockedProfiles": self._profiles(self.comment_blocked_profiles.get()),
                    "profileCooldownHours": self._int(self.comment_profile_cooldown.get(), "Cooldown por perfil", 0, 24 * 30),
                    "duplicateVideoWindowHours": self._int(self.comment_duplicate_window.get(), "Não repetir vídeo", 0, 24 * 30),
                    "maxCommentsPerProfilePerDay": self._int(self.comment_max_profile_day.get(), "Máx. comentários/perfil/dia", 0, 100),
                    "avoidRecentCommentSimilarity": bool(self.comment_avoid_similarity.get()),
                    "similarityThreshold": self._int(self.comment_similarity_threshold.get(), "Similaridade máxima", 0, 100) / 100,
                    "recentCommentComparisonCount": self._int(self.comment_similarity_count.get(), "Comparar últimos comentários", 1, 200),
                    "followExchange": {
                        "enabled": bool(self.follow_exchange_enabled.get()),
                        "indicatorPhrases": self._semicolon(self.follow_exchange_phrases.get()),
                        "sampleSize": self._int(self.follow_exchange_sample_size.get(), "Comentários para analisar", 3, 100),
                        "maxScrolls": self._int(self.follow_exchange_max_scrolls.get(), "Máx. rolagens", 0, 10),
                        "minMatchedComments": self._int(self.follow_exchange_min_matches.get(), "Mín. comentários com sinais", 1, 100),
                        "minConfidence": self._int(self.follow_exchange_confidence.get(), "Confiança mínima", 0, 100) / 100,
                        "commentEnabled": bool(self.follow_exchange_comment_enabled.get()),
                        "commentTemplates": self._semicolon(self.follow_exchange_templates.get()),
                        "useAiVariation": bool(self.follow_exchange_ai_variation.get()),
                        "allowRepeatedTemplates": bool(self.follow_exchange_allow_repeated_templates.get()),
                        "replaceNormalComment": bool(self.follow_exchange_replace_normal.get()),
                        "bypassNormalContentFilters": bool(self.follow_exchange_bypass_filters.get()),
                        "likeCommentsEnabled": bool(self.follow_exchange_like_comments.get()),
                        "maxCommentLikesPerVideo": self._int(self.follow_exchange_max_likes.get(), "Likes em comentários/vídeo", 0, 50),
                        "dailyCommentLikeLimit": self._int(self.follow_exchange_daily_likes.get(), "Likes em comentários/dia", 0, 500),
                        "likeOnlyMatchingSignals": bool(self.follow_exchange_like_matching.get()),
                        "excludeCreatorComments": bool(self.follow_exchange_exclude_creator.get()),
                    },
                },
            }

            if data["content"]["commentPolicy"]["minLength"] > data["content"]["maxLength"]:
                raise ValueError("Mín. caracteres não pode ser maior que Máx. caracteres.")

            exchange_cfg = data["content"]["commentPolicy"]["followExchange"]
            if exchange_cfg["enabled"] and not exchange_cfg["indicatorPhrases"]:
                raise ValueError("Informe ao menos uma frase indicadora para troca de follow.")
            if exchange_cfg["commentEnabled"] and not exchange_cfg["commentTemplates"]:
                raise ValueError("Informe ao menos um comentário especial para troca de follow.")
            if exchange_cfg["minMatchedComments"] > exchange_cfg["sampleSize"]:
                raise ValueError("Mín. comentários com sinais não pode ser maior que Comentários para analisar.")

            warm = self.warmup_seconds.get().strip()
            if warm:
                data["warmupSeconds"] = self._int(warm, "Warmup", 0)
            else:
                data.pop("warmupSeconds", None)

            data["automationCore"] = {
                "enabled": bool(self.core_enabled.get()),
                "followBackCheckHours": self._int(self.followback_hours.get(), "Follow-back (horas)", 1, 24 * 30),
                "hashtags": {
                    "enabled": bool(self.hashtag_enabled.get()),
                    "include": self._csv(self.hashtag_include.get()),
                    "exclude": self._csv(self.hashtag_exclude.get()),
                    "matchMode": self.hashtag_mode.get() if self.hashtag_mode.get() in ("any", "all") else "any",
                    "maxCandidatesPerCycle": self._int(self.hashtag_max.get(), "Máx. candidatos", 1, 100),
                },
            }

            CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            temp = CONFIG_PATH.with_suffix(".json.tmp")
            temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            temp.replace(CONFIG_PATH)

            if not quiet:
                messagebox.showinfo("Configuração", "Configuração salva.")
            return True
        except Exception as exc:
            messagebox.showerror("Configuração inválida", str(exc))
            return False

    def start_bot(self, mode: str) -> None:
        if self.process and self.process.poll() is None:
            messagebox.showwarning("TikTok Bot", "O bot já está em execução.")
            return

        if not self.save_config(quiet=True):
            return

        if mode == "real":
            confirmed = messagebox.askyesno(
                "Modo REAL",
                "No modo REAL, ações habilitadas podem alterar a conta do TikTok, incluindo comentários e likes em comentários quando configurados.\n\nDeseja iniciar?",
            )
            if not confirmed:
                return

        switch = "-Real" if mode == "real" else "-Test"
        command = [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(START_SCRIPT),
            switch,
        ]

        try:
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            self.process = subprocess.Popen(
                command,
                cwd=str(ROOT),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=flags,
            )
        except Exception as exc:
            messagebox.showerror("TikTok Bot", f"Falha ao iniciar:\n\n{exc}")
            return

        self._append_log(f"[PAINEL] Iniciando modo {mode.upper()}...")

        thread = threading.Thread(target=self._read_process_output, daemon=True)
        thread.start()

    def _read_process_output(self) -> None:
        process = self.process
        if not process or not process.stdout:
            return

        for line in process.stdout:
            self.output_queue.put(line.rstrip())

        code = process.wait()
        self.output_queue.put(f"[PAINEL] Processo finalizado com exit code {code}.")

    def _drain_output_queue(self) -> None:
        try:
            while True:
                line = self.output_queue.get_nowait()
                self._append_log(line)
        except queue.Empty:
            pass

        if not self._closing:
            self.after(200, self._drain_output_queue)

    def _append_log(self, text: str) -> None:
        stamp = time.strftime("%H:%M:%S")
        self.logs_text.insert("end", f"[{stamp}] {text}\n")
        self.logs_text.see("end")

        lines = int(self.logs_text.index("end-1c").split(".")[0])
        if lines > 1200:
            self.logs_text.delete("1.0", "200.0")

    def send_command(self, command: str, **extra: object) -> str:
        RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

        request_id = f"{int(time.time() * 1000)}-{os.getpid()}"

        payload: dict[str, object] = {
            "command": command,
            "requestId": request_id,
            "requestedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "source": "python-panel",
        }
        payload.update(extra)

        temp = COMMAND_PATH.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        temp.replace(COMMAND_PATH)

        self._append_log(f"[PAINEL] Comando enviado: {command}")
        return request_id

    def check_relationship(self) -> None:
        username = self.relationship_username.get().strip().lstrip("@")
        if not username:
            messagebox.showwarning("Relacionamento", "Informe um @username.")
            return

        if self.bot_state.get().lower() not in ("running", "paused"):
            messagebox.showwarning(
                "Relacionamento",
                "Inicie o bot antes da checagem read-only para que o provider Android esteja disponível.",
            )
            return

        self.relationship_result.set("checando...")
        self.send_command("check_relationship", username=username)

    def review_selected(self, command: str) -> None:
        selected = self.review_tree.selection()
        if not selected:
            messagebox.showwarning("Revisão", "Selecione uma revisão pendente.")
            return

        action_id = selected[0]
        values = self.review_tree.item(action_id, "values")
        kind = str(values[0]) if values else ""

        if command in ("approve_discovery", "reject_discovery") and kind != "discovery":
            messagebox.showwarning("Revisão", "Selecione uma revisão DISCOVERY para esta decisão.")
            return

        if command == "cancel_unfollow" and kind != "unfollow":
            messagebox.showwarning("Revisão", "Selecione uma revisão UNFOLLOW para cancelar.")
            return

        if command == "approve_discovery":
            confirmed = messagebox.askyesno(
                "Aprovar DISCOVERY",
                "Aprovar este candidato?\n\nA aprovação NÃO executa follow, like, comment, share ou DM.",
            )
            if not confirmed:
                return

        if command == "cancel_unfollow":
            confirmed = messagebox.askyesno(
                "Cancelar UNFOLLOW",
                "Cancelar esta revisão de UNFOLLOW?\n\nNenhum unfollow será executado.",
            )
            if not confirmed:
                return

        self.send_command(command, actionId=action_id)

    @staticmethod
    def _replace_tree(tree: ttk.Treeview, rows: list[tuple[str, tuple[object, ...]]]) -> None:
        for item in tree.get_children():
            tree.delete(item)

        for item_id, values in rows:
            tree.insert("", "end", iid=item_id, values=values)

    def _poll_status(self) -> None:
        try:
            if STATUS_PATH.exists():
                mtime = STATUS_PATH.stat().st_mtime
                if mtime != self._last_status_mtime:
                    self._last_status_mtime = mtime
                    self._read_status()
            else:
                self.bot_state.set("stopped")
        except Exception as exc:
            self._append_log(f"[PAINEL] Falha ao ler status: {exc}")

        if not self._closing:
            self.after(1000, self._poll_status)

    def _read_status(self) -> None:
        data = json.loads(STATUS_PATH.read_text(encoding="utf-8"))

        self.bot_state.set(str(data.get("state", "stopped")))
        self.bot_mode.set(str(data.get("mode", "-")).upper())
        self.current_action.set(str(data.get("currentAction") or "-"))
        self.last_action.set(str(data.get("lastAction") or "-"))
        self.next_action.set(str(data.get("nextActionTime") or "-"))
        self.last_error.set(str(data.get("lastError") or "-"))

        stats = data.get("stats", {})
        for key, variable in self.stat_vars.items():
            variable.set(str(stats.get(key, 0)))

        core = data.get("automationCore", {})
        self.core_state.set(str(core.get("state", "stopped")))
        self.core_tick.set("ativo" if core.get("tickActive") else "inativo")

        interval_ms = core.get("intervalMs")
        if isinstance(interval_ms, (int, float)):
            self.core_interval.set(f"{int(interval_ms / 1000)} s")
        else:
            self.core_interval.set("-")

        self.core_last_tick.set(str(core.get("lastRunCompletedAt") or core.get("lastRunStartedAt") or "-"))

        result = core.get("lastResult")
        if isinstance(result, dict):
            self.core_result.set(
                "scanned={scanned} processed={processed} ok={succeeded} failed={failed}".format(
                    scanned=result.get("scanned", 0),
                    processed=result.get("processed", 0),
                    succeeded=result.get("succeeded", 0),
                    failed=result.get("failed", 0),
                )
            )
        else:
            self.core_result.set("-")

        device = str(data.get("deviceId") or "-")
        if device != "-":
            self.device_state.set(device)

        provider = data.get("providerControl", {})
        registered = provider.get("registeredProviders", []) if isinstance(provider, dict) else []
        mobile_provider = provider.get("mobileProvider", {}) if isinstance(provider, dict) else {}
        active_provider = bool(mobile_provider.get("active")) if isinstance(mobile_provider, dict) else False

        if "android" in registered:
            self.provider_state.set("android • ativo" if active_provider else "android • registrado")
        else:
            self.provider_state.set("android • aguardando")

        mobile_agents = provider.get("mobileAgents", []) if isinstance(provider, dict) else []
        if isinstance(mobile_agents, list) and mobile_agents:
            first_agent = mobile_agents[0] if isinstance(mobile_agents[0], dict) else {}
            self.account_state.set(str(first_agent.get("id") or "-"))
        else:
            self.account_state.set("-")

        database = data.get("database", {})
        if isinstance(database, dict) and database.get("connected"):
            self.database_state.set("conectado")
        elif isinstance(database, dict) and database.get("error"):
            self.database_state.set("indisponível")
        else:
            self.database_state.set("desligado")

        reviews = data.get("manualReviews", [])
        if not isinstance(reviews, list):
            reviews = []

        review_rows: list[tuple[str, tuple[object, ...]]] = []
        for review in reviews:
            if not isinstance(review, dict):
                continue

            action_id = str(review.get("id") or "")
            if not action_id:
                continue

            hashtags = review.get("hashtags", [])
            hashtags_text = ", ".join(f"#{tag}" for tag in hashtags) if isinstance(hashtags, list) else ""

            review_rows.append(
                (
                    action_id,
                    (
                        str(review.get("kind") or ""),
                        str(review.get("username") or ""),
                        str(review.get("reason") or ""),
                        str(review.get("query") or ""),
                        hashtags_text,
                        str(review.get("createdAt") or ""),
                    ),
                )
            )

        self.review_count.set(str(len(review_rows)))
        self._replace_tree(self.review_tree, review_rows)

        actions = data.get("recentActions", [])
        if not isinstance(actions, list):
            actions = []

        history_rows: list[tuple[str, tuple[object, ...]]] = []
        for index, action in enumerate(actions):
            if not isinstance(action, dict):
                continue

            action_id = str(action.get("id") or f"action-{index}")
            history_rows.append(
                (
                    f"history-{action_id}-{index}",
                    (
                        str(action.get("type") or ""),
                        str(action.get("status") or ""),
                        str(action.get("targetUsername") or ""),
                        str(action.get("provider") or ""),
                        str(action.get("updatedAt") or action.get("createdAt") or ""),
                        str(action.get("error") or ""),
                    ),
                )
            )

        self.history_count.set(str(len(history_rows)))
        self._replace_tree(self.history_tree, history_rows)

        relationships = data.get("recentRelationships", [])
        if not isinstance(relationships, list):
            relationships = []

        relation_rows: list[tuple[str, tuple[object, ...]]] = []
        for index, relationship in enumerate(relationships):
            if not isinstance(relationship, dict):
                continue

            row_key = str(
                relationship.get("id")
                or relationship.get("targetKey")
                or f"relationship-{index}"
            )

            relation_rows.append(
                (
                    f"relationship-{row_key}-{index}",
                    (
                        str(relationship.get("username") or ""),
                        str(relationship.get("relationshipState") or ""),
                        str(relationship.get("followsUs") if relationship.get("followsUs") is not None else "-"),
                        str(relationship.get("followedByUs") if relationship.get("followedByUs") is not None else "-"),
                        str(relationship.get("protected") if relationship.get("protected") is not None else "-"),
                        str(relationship.get("lastCheckedAt") or relationship.get("updatedAt") or ""),
                    ),
                )
            )

        self._replace_tree(self.relationship_tree, relation_rows)

        comment_history = data.get("commentHistory", [])
        if not isinstance(comment_history, list):
            comment_history = []

        comment_rows: list[tuple[str, tuple[object, ...]]] = []
        for index, entry in enumerate(comment_history):
            if not isinstance(entry, dict):
                continue

            text = str(entry.get("commentText") or "")
            if entry.get("status") == "comment_like":
                text = f"LIKE: {text}"

            comment_rows.append(
                (
                    f"comment-history-{index}",
                    (
                        str(entry.get("timestamp") or ""),
                        str(entry.get("kind") or ""),
                        str(entry.get("status") or ""),
                        str(entry.get("creatorUsername") or ""),
                        text,
                    ),
                )
            )

        self.comment_history_count.set(str(len(comment_rows)))
        self._replace_tree(self.comment_history_tree, comment_rows)

        control_result = data.get("lastControlResult")
        if isinstance(control_result, dict):
            control_key = "|".join(
                str(control_result.get(part) or "")
                for part in ("requestId", "command", "completedAt")
            )

            if control_key and control_key != self._last_control_result_key:
                self._last_control_result_key = control_key
                command = str(control_result.get("command") or "")
                success = bool(control_result.get("success"))
                error = str(control_result.get("error") or "")
                command_result = control_result.get("result")

                if command == "check_relationship":
                    if success and isinstance(command_result, dict):
                        relationship = str(command_result.get("relationship") or "unknown")
                        provider_name = str(command_result.get("provider") or "android")
                        observed = str(command_result.get("observedAt") or "")
                        self.relationship_result.set(
                            f"{relationship} • {provider_name} • {observed}"
                        )
                    else:
                        self.relationship_result.set(f"erro: {error or 'falha na checagem'}")

                if success:
                    self._append_log(f"[PAINEL] Comando concluído: {command}")
                else:
                    self._append_log(f"[PAINEL] Falha no comando {command}: {error}")

        for entry in data.get("logs", []):
            if not isinstance(entry, dict):
                continue
            key = "|".join(
                str(entry.get(part, ""))
                for part in ("timestamp", "action", "status", "message")
            )
            if key in self.seen_logs:
                continue

            self.seen_logs.add(key)
            timestamp = str(entry.get("timestamp", ""))
            action = str(entry.get("action", ""))
            status = str(entry.get("status", ""))
            message = str(entry.get("message", ""))
            self._append_log(f"{timestamp} [{action}/{status}] {message}")

    def _resolve_adb_command(self) -> str:
        candidates: list[Path] = []

        for variable in ("ANDROID_SDK_ROOT", "ANDROID_HOME"):
            value = os.environ.get(variable)
            if value:
                candidates.append(Path(value) / "platform-tools" / "adb.exe")

        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            candidates.append(
                Path(local_app_data) / "Android" / "Sdk" / "platform-tools" / "adb.exe"
            )

        for candidate in candidates:
            if candidate.exists():
                return str(candidate)

        discovered = shutil.which("adb")
        return discovered or "adb"

    def _connection_monitor_tick(self) -> None:
        if self._closing:
            return

        self.refresh_connections()
        self.after(5000, self._connection_monitor_tick)

    def refresh_connections(self) -> None:
        if self._connection_refresh_inflight:
            return

        self._connection_refresh_inflight = True

        def worker() -> None:
            device_text = "não encontrado"
            appium_text = "offline"

            try:
                adb_command = self._resolve_adb_command()
                out = subprocess.check_output(
                    [adb_command, "devices"],
                    cwd=str(ROOT),
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=5,
                )
                devices = []
                for line in out.splitlines()[1:]:
                    parts = line.split()
                    if len(parts) >= 2 and parts[1] == "device":
                        devices.append(parts[0])
                if devices:
                    device_text = ", ".join(devices)
            except Exception:
                device_text = "ADB indisponível"

            try:
                config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
                url = str(config.get("appiumUrl", "http://127.0.0.1:4723")).rstrip("/") + "/status"
                with urlopen(url, timeout=3) as response:
                    if 200 <= response.status < 300:
                        payload = json.loads(response.read().decode("utf-8", errors="replace") or "{}")
                        value = payload.get("value", payload) if isinstance(payload, dict) else {}
                        ready = value.get("ready") if isinstance(value, dict) else None
                        appium_text = "online" if ready is not False else "ocupado"
            except Exception:
                appium_text = "offline"

            def apply_result() -> None:
                self._connection_refresh_inflight = False
                if self._closing:
                    return

                self.device_state.set(device_text)
                self.appium_state.set(appium_text)

            self.after(0, apply_result)

        threading.Thread(target=worker, daemon=True).start()

    def _on_close(self) -> None:
        state = self.bot_state.get().lower()

        if state in ("running", "paused"):
            answer = messagebox.askyesnocancel(
                "Fechar painel",
                "O bot está ativo.\n\nSim = parar o bot e fechar\nNão = manter o bot rodando e fechar o painel\nCancelar = voltar",
            )

            if answer is None:
                return

            if answer:
                self.send_command("stop")

        self._closing = True
        self.destroy()


if __name__ == "__main__":
    app = TikTokBotPanel()
    app.mainloop()
