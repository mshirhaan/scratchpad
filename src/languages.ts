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
    template: `class Solution:
    def solve(self, nums: list[int]) -> int:
        total = 0
        for n in nums:
            total += n
        return total


print(Solution().solve([1, 2, 3]))
`,
  },
  {
    id: 'javascript', label: 'JavaScript', monaco: 'javascript', ext: 'js', runs: 'browser', debug: 'browser',
    template: `function solve(nums) {
  let total = 0;
  for (const n of nums) {
    total += n;
  }
  return total;
}

console.log(solve([1, 2, 3]));
`,
  },
  {
    id: 'typescript', label: 'TypeScript', monaco: 'typescript', ext: 'ts', runs: 'browser', debug: 'browser',
    template: `function solve(nums: number[]): number {
  let total = 0;
  for (const n of nums) {
    total += n;
  }
  return total;
}

console.log(solve([1, 2, 3]));
`,
  },
  {
    id: 'java', label: 'Java', monaco: 'java', ext: 'java', runs: 'server', debug: 'server',
    template: `import java.util.*;

public class Main {
    static int solve(int[] nums) {
        int total = 0;
        for (int n : nums) {
            total += n;
        }
        return total;
    }

    public static void main(String[] args) {
        System.out.println(solve(new int[]{1, 2, 3}));
    }
}
`,
  },
  {
    id: 'cpp', label: 'C++', monaco: 'cpp', ext: 'cpp', runs: 'server', debug: 'server',
    template: `#include <bits/stdc++.h>
using namespace std;

int solve(vector<int>& nums) {
    int total = 0;
    for (int n : nums) {
        total += n;
    }
    return total;
}

int main() {
    vector<int> nums = {1, 2, 3};
    cout << solve(nums) << endl;
    return 0;
}
`,
  },
  {
    id: 'c', label: 'C', monaco: 'c', ext: 'c', runs: 'server', debug: 'server',
    template: `#include <stdio.h>

int solve(int *nums, int n) {
    int total = 0;
    for (int i = 0; i < n; i++) {
        total += nums[i];
    }
    return total;
}

int main(void) {
    int nums[] = {1, 2, 3};
    printf("%d\\n", solve(nums, 3));
    return 0;
}
`,
  },
  {
    id: 'go', label: 'Go', monaco: 'go', ext: 'go', runs: 'server', debug: null,
    template: `package main

import "fmt"

func solve(nums []int) int {
	total := 0
	for _, n := range nums {
		total += n
	}
	return total
}

func main() {
	fmt.Println(solve([]int{1, 2, 3}))
}
`,
  },
  {
    id: 'rust', label: 'Rust', monaco: 'rust', ext: 'rs', runs: 'server', debug: null,
    template: `fn solve(nums: &[i32]) -> i32 {
    nums.iter().sum()
}

fn main() {
    println!("{}", solve(&[1, 2, 3]));
}
`,
  },
  {
    id: 'csharp', label: 'C#', monaco: 'csharp', ext: 'cs', runs: 'server', debug: null,
    template: `using System;
using System.Linq;

int Solve(int[] nums) => nums.Sum();

Console.WriteLine(Solve(new[] { 1, 2, 3 }));
`,
  },
  {
    id: 'kotlin', label: 'Kotlin', monaco: 'kotlin', ext: 'kt', runs: 'server', debug: null,
    template: `fun solve(nums: IntArray): Int = nums.sum()

fun main() {
    println(solve(intArrayOf(1, 2, 3)))
}
`,
  },
  {
    id: 'swift', label: 'Swift', monaco: 'swift', ext: 'swift', runs: 'server', debug: null,
    template: `func solve(_ nums: [Int]) -> Int {
    return nums.reduce(0, +)
}

print(solve([1, 2, 3]))
`,
  },
  {
    id: 'ruby', label: 'Ruby', monaco: 'ruby', ext: 'rb', runs: 'server', debug: null,
    template: `def solve(nums)
  nums.sum
end

puts solve([1, 2, 3])
`,
  },
  {
    id: 'php', label: 'PHP', monaco: 'php', ext: 'php', runs: 'server', debug: null,
    template: `<?php
function solve(array $nums): int {
    return array_sum($nums);
}

echo solve([1, 2, 3]), PHP_EOL;
`,
  },
];

export const LANG_BY_ID = Object.fromEntries(LANGUAGES.map((l) => [l.id, l])) as Record<LangId, Language>;
