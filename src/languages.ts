import type { LangId } from './types';

export interface Language {
  id: LangId;
  label: string;
  monaco: string;
  ext: string;
  /** Where code runs: in the browser, or on the Scratchpad server. */
  runs: 'browser' | 'server';
  /** Where step debugging is available, if at all. */
  debug: 'browser' | 'server' | null;
  template: string;
}

export const LANGUAGES: Language[] = [
  {
    id: 'python', label: 'Python', monaco: 'python', ext: 'py', runs: 'browser', debug: 'browser',
    template: `def main():
    pass


if __name__ == "__main__":
    main()
`,
  },
  {
    id: 'javascript', label: 'JavaScript', monaco: 'javascript', ext: 'js', runs: 'browser', debug: 'browser',
    template: `function main() {
  
}

main();
`,
  },
  {
    id: 'typescript', label: 'TypeScript', monaco: 'typescript', ext: 'ts', runs: 'browser', debug: 'browser',
    template: `function main(): void {
  
}

main();
`,
  },
  {
    id: 'java', label: 'Java', monaco: 'java', ext: 'java', runs: 'server', debug: 'server',
    template: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        
    }
}
`,
  },
  {
    id: 'cpp', label: 'C++', monaco: 'cpp', ext: 'cpp', runs: 'server', debug: 'server',
    template: `#include <algorithm>
#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>
using namespace std;

int main() {
    
    return 0;
}
`,
  },
  {
    id: 'c', label: 'C', monaco: 'c', ext: 'c', runs: 'server', debug: 'server',
    template: `#include <stdio.h>

int main(void) {
    
    return 0;
}
`,
  },
  {
    id: 'go', label: 'Go', monaco: 'go', ext: 'go', runs: 'server', debug: null,
    template: `package main

func main() {
	
}
`,
  },
  {
    id: 'rust', label: 'Rust', monaco: 'rust', ext: 'rs', runs: 'server', debug: null,
    template: `fn main() {
    
}
`,
  },
  {
    id: 'csharp', label: 'C#', monaco: 'csharp', ext: 'cs', runs: 'server', debug: null,
    template: `using System;
using System.Collections.Generic;

class Program
{
    static void Main()
    {
        
    }
}
`,
  },
  {
    id: 'kotlin', label: 'Kotlin', monaco: 'kotlin', ext: 'kt', runs: 'server', debug: null,
    template: `fun main() {
    
}
`,
  },
  {
    id: 'swift', label: 'Swift', monaco: 'swift', ext: 'swift', runs: 'server', debug: null,
    template: `import Foundation

func main() {
    
}

main()
`,
  },
  {
    id: 'ruby', label: 'Ruby', monaco: 'ruby', ext: 'rb', runs: 'server', debug: null,
    template: `def main
  
end

main
`,
  },
  {
    id: 'php', label: 'PHP', monaco: 'php', ext: 'php', runs: 'server', debug: null,
    template: `<?php

function main(): void {
    
}

main();
`,
  },
];

export const LANG_BY_ID = Object.fromEntries(LANGUAGES.map((l) => [l.id, l])) as Record<LangId, Language>;
