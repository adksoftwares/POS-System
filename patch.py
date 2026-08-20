import re

with open('src/components/StandaloneCart.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('  const [searchQuery, setSearchQuery] = useState(\'\');\n  const [searchResults, setSearchResults] = useState([]);', '  const [searchResults, setSearchResults] = useState([]);')

with open('src/components/StandaloneCart.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
