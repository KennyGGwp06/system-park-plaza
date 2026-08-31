import sys

filepath = r"c:\prácticas_amayo\system-park-plaza\client\src\modules\employees\MaintenancePage.jsx"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

# We want to remove lines 203 through 261. In 0-indexed, that's lines[202:261]
del lines[202:261]

with open(filepath, "w", encoding="utf-8") as f:
    f.writelines(lines)
