#!/usr/bin/env bash
# =============================================================================
# PM board 数据备份脚本（在服务器上执行）
#
#   备份内容：SQLite 数据库（一致性快照）+ uploads 附件目录
#   备份位置：默认 /opt/pm-board-backups/<日期时间>/  （可用 BACKUP_ROOT 覆盖）
#   保留策略：默认保留 14 天（可用 KEEP_DAYS 覆盖）
#
# 用法：
#   bash deploy/backup.sh                                    # 手动备份
#   加入 crontab 每天 03:00 自动备份：
#     crontab -e
#     0 3 * * * bash /opt/pm-board/deploy/backup.sh >> /var/log/pm-board-backup.log 2>&1
#
# 说明：用 sqlite3 .backup 而非直接 cp，可拿到一致快照，避免 WAL 模式下漏掉
#       尚未合并进主库文件的最近写入。
# =============================================================================
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/pm-board}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/pm-board-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

DB_FILE="$PROJECT_DIR/server/data/pm-board.db"
UPLOADS_DIR="$PROJECT_DIR/server/data/uploads"

STAMP="$(date +%F-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

# 1) 数据库一致性备份
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "[backup] ERROR: sqlite3 未安装，请先执行 apt-get install -y sqlite3" >&2
  exit 1
fi
sqlite3 "$DB_FILE" ".backup '$DEST/pm-board.db'"
echo "[backup] db       : $DEST/pm-board.db ($(du -h "$DEST/pm-board.db" | cut -f1))"

# 2) 附件目录
if [ -d "$UPLOADS_DIR" ]; then
  tar czf "$DEST/uploads.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  echo "[backup] uploads  : $DEST/uploads.tar.gz ($(du -h "$DEST/uploads.tar.gz" | cut -f1))"
else
  echo "[backup] uploads  : 目录不存在，已跳过（$UPLOADS_DIR）"
fi

# 3) 元信息：备份时点的数据量，方便日后判断备份是否完整
sqlite3 "$DB_FILE" \
  "SELECT 'projects='||COUNT(*) FROM projects; SELECT 'tasks='||COUNT(*) FROM tasks; SELECT 'users='||COUNT(*) FROM users;" \
  > "$DEST/summary.txt" 2>/dev/null || true

# 4) 清理过期备份
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +

echo "[backup] done     -> $DEST"
