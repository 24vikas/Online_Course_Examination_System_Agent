"""
Skill Loader & Dynamic Instruction Discovery for LangGraph Workers
KLE Technological University — Course 26ECAC401 (Agentic AI)
Team 5: Team AURA
"""

import os
import re
from typing import Dict, Any, List, Optional


class SkillLoader:
    """Discovers and parses portable SKILL.md instruction files from the project skills directory."""

    def __init__(self, skills_dir: Optional[str] = None):
        if skills_dir is None:
            # Locate repo root by walking up from workflow-worker
            current_dir = os.path.dirname(os.path.abspath(__file__))
            repo_root = os.path.abspath(os.path.join(current_dir, "../../../"))
            self.skills_dir = os.path.join(repo_root, "skills")
        else:
            self.skills_dir = skills_dir

        self._skills_cache: Dict[str, Dict[str, Any]] = {}
        self.refresh()

    def refresh(self) -> None:
        """Scans the skills directory and loads all valid SKILL.md declarations."""
        self._skills_cache.clear()
        if not os.path.exists(self.skills_dir):
            return

        for entry in os.listdir(self.skills_dir):
            entry_path = os.path.join(self.skills_dir, entry)
            if os.path.isdir(entry_path):
                skill_file = os.path.join(entry_path, "SKILL.md")
                if os.path.exists(skill_file):
                    try:
                        parsed = self._parse_skill_file(skill_file)
                        if parsed and "name" in parsed.get("frontmatter", {}):
                            skill_name = parsed["frontmatter"]["name"]
                            self._skills_cache[skill_name] = parsed
                    except Exception:
                        pass

    def _parse_skill_file(self, file_path: str) -> Optional[Dict[str, Any]]:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Parse YAML frontmatter between --- and ---
        match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, re.DOTALL)
        if not match:
            return None

        frontmatter_raw = match.group(1)
        body = match.group(2).strip()

        frontmatter: Dict[str, Any] = {}
        for line in frontmatter_raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if v.startswith("[") and v.endswith("]"):
                    # Basic list parsing
                    items = [x.strip().strip('"').strip("'") for x in v[1:-1].split(",") if x.strip()]
                    frontmatter[k] = items
                else:
                    frontmatter[k] = v

        return {
            "name": frontmatter.get("name", os.path.basename(os.path.dirname(file_path))),
            "file_path": file_path,
            "frontmatter": frontmatter,
            "instructions": body,
        }

    def get_skill(self, name: str) -> Optional[Dict[str, Any]]:
        return self._skills_cache.get(name)

    def get_skill_instructions(self, name: str) -> str:
        skill = self.get_skill(name)
        if skill:
            return skill.get("instructions", "")
        return ""

    def list_skills(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": s["name"],
                "description": s["frontmatter"].get("description", ""),
                "version": s["frontmatter"].get("version", "1.0.0"),
                "allowed_tools": s["frontmatter"].get("allowed-tools", []),
                "risk_level": s["frontmatter"].get("riskLevel", "LOW"),
            }
            for s in self._skills_cache.values()
        ]


# Singleton instance
_SKILL_LOADER_INSTANCE = None


def get_skill_loader() -> SkillLoader:
    global _SKILL_LOADER_INSTANCE
    if _SKILL_LOADER_INSTANCE is None:
        _SKILL_LOADER_INSTANCE = SkillLoader()
    return _SKILL_LOADER_INSTANCE
