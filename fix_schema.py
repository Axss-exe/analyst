import re

def fix_schema(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    result = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # Match:   (t) => [
        match = re.match(r'^(\s*)\((\w+)\)\s*=>\s*\[', line)
        if match:
            indent = match.group(1)
            param = match.group(2)
            result.append(indent + '(' + param + ') => ({\n')

            i += 1
            idx_count = 0
            while i < len(lines):
                current = lines[i]
                stripped = current.strip()
                # Match closing ]); or ],
                if stripped.startswith(']') and (stripped.endswith(',') or stripped.endswith(');') or stripped == ']'):
                    # Remove trailing comma from last property
                    if result and result[-1].rstrip().endswith(','):
                        result[-1] = result[-1].rstrip()[:-1] + '\n'
                    # Replace ] with }) to close both object and array
                    closing = current.replace(']', '})')
                    result.append(closing)
                    i += 1
                    break
                else:
                    if stripped and not stripped.startswith('//'):
                        idx_name = 'idx' + str(idx_count)
                        name_match = re.search(r'index\("([^"]+)"\)', stripped)
                        if name_match:
                            idx_name = name_match.group(1).replace('-', '_').replace('.', '_')
                        new_line = indent + '  ' + idx_name + ': ' + stripped
                        if not new_line.rstrip().endswith(','):
                            new_line = new_line.rstrip() + ',\n'
                        else:
                            new_line = new_line.rstrip() + '\n'
                        result.append(new_line)
                        idx_count += 1
                    else:
                        result.append(current)
                    i += 1
            continue

        result.append(line)
        i += 1

    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(result)

    print('Fixed ' + filepath)

if __name__ == '__main__':
    fix_schema('db/schema.ts')
