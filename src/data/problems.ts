// Starter roadmap: well-known LeetCode problems grouped by topic.
// Each line is "number|title|difficulty" (E/M/H). Add your own in the app.
import type { Difficulty, Problem } from '../types';

const SEED: Record<string, string> = {
  'Arrays & Hashing': `1|Two Sum|E
217|Contains Duplicate|E
242|Valid Anagram|E
49|Group Anagrams|M
347|Top K Frequent Elements|M
238|Product of Array Except Self|M
36|Valid Sudoku|M
128|Longest Consecutive Sequence|M`,
  'Two Pointers': `125|Valid Palindrome|E
167|Two Sum II - Input Array Is Sorted|M
15|3Sum|M
11|Container With Most Water|M
42|Trapping Rain Water|H`,
  'Sliding Window': `121|Best Time to Buy and Sell Stock|E
3|Longest Substring Without Repeating Characters|M
424|Longest Repeating Character Replacement|M
567|Permutation in String|M
76|Minimum Window Substring|H
239|Sliding Window Maximum|H`,
  Stack: `20|Valid Parentheses|E
155|Min Stack|M
150|Evaluate Reverse Polish Notation|M
22|Generate Parentheses|M
739|Daily Temperatures|M
84|Largest Rectangle in Histogram|H`,
  'Binary Search': `704|Binary Search|E
74|Search a 2D Matrix|M
875|Koko Eating Bananas|M
153|Find Minimum in Rotated Sorted Array|M
33|Search in Rotated Sorted Array|M
4|Median of Two Sorted Arrays|H`,
  'Linked List': `206|Reverse Linked List|E
21|Merge Two Sorted Lists|E
141|Linked List Cycle|E
143|Reorder List|M
19|Remove Nth Node From End of List|M
138|Copy List with Random Pointer|M
2|Add Two Numbers|M
146|LRU Cache|M
23|Merge k Sorted Lists|H
25|Reverse Nodes in k-Group|H`,
  Trees: `226|Invert Binary Tree|E
104|Maximum Depth of Binary Tree|E
543|Diameter of Binary Tree|E
110|Balanced Binary Tree|E
100|Same Tree|E
572|Subtree of Another Tree|E
235|Lowest Common Ancestor of a Binary Search Tree|M
102|Binary Tree Level Order Traversal|M
199|Binary Tree Right Side View|M
98|Validate Binary Search Tree|M
230|Kth Smallest Element in a BST|M
105|Construct Binary Tree from Preorder and Inorder Traversal|M
124|Binary Tree Maximum Path Sum|H
297|Serialize and Deserialize Binary Tree|H`,
  Tries: `208|Implement Trie (Prefix Tree)|M
211|Design Add and Search Words Data Structure|M
212|Word Search II|H`,
  'Heap / Priority Queue': `703|Kth Largest Element in a Stream|E
1046|Last Stone Weight|E
973|K Closest Points to Origin|M
215|Kth Largest Element in an Array|M
621|Task Scheduler|M
295|Find Median from Data Stream|H`,
  Backtracking: `78|Subsets|M
39|Combination Sum|M
46|Permutations|M
90|Subsets II|M
40|Combination Sum II|M
79|Word Search|M
131|Palindrome Partitioning|M
17|Letter Combinations of a Phone Number|M
51|N-Queens|H`,
  Graphs: `200|Number of Islands|M
133|Clone Graph|M
695|Max Area of Island|M
417|Pacific Atlantic Water Flow|M
130|Surrounded Regions|M
994|Rotting Oranges|M
207|Course Schedule|M
210|Course Schedule II|M
684|Redundant Connection|M
743|Network Delay Time|M
787|Cheapest Flights Within K Stops|M
127|Word Ladder|H`,
  'Dynamic Programming': `70|Climbing Stairs|E
746|Min Cost Climbing Stairs|E
198|House Robber|M
213|House Robber II|M
5|Longest Palindromic Substring|M
647|Palindromic Substrings|M
91|Decode Ways|M
322|Coin Change|M
152|Maximum Product Subarray|M
139|Word Break|M
300|Longest Increasing Subsequence|M
416|Partition Equal Subset Sum|M
62|Unique Paths|M
1143|Longest Common Subsequence|M
72|Edit Distance|M`,
  Greedy: `53|Maximum Subarray|M
55|Jump Game|M
45|Jump Game II|M
134|Gas Station|M`,
  Intervals: `57|Insert Interval|M
56|Merge Intervals|M
435|Non-overlapping Intervals|M`,
  'Bit Manipulation': `136|Single Number|E
191|Number of 1 Bits|E
338|Counting Bits|E
190|Reverse Bits|E
268|Missing Number|E
371|Sum of Two Integers|M`,
  'Math & Matrix': `202|Happy Number|E
66|Plus One|E
48|Rotate Image|M
54|Spiral Matrix|M
73|Set Matrix Zeroes|M
50|Pow(x, n)|M`,
};

const DIFF: Record<string, Difficulty> = { E: 'Easy', M: 'Medium', H: 'Hard' };

export const slugify = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');

export function seedProblems(): Problem[] {
  const out: Problem[] = [];
  for (const [topic, block] of Object.entries(SEED)) {
    for (const line of block.split('\n')) {
      const [num, title, d] = line.split('|');
      const slug = slugify(title);
      out.push({ id: `lc-${num}`, number: Number(num), title, url: `https://leetcode.com/problems/${slug}/`, difficulty: DIFF[d], topic, status: 'todo' });
    }
  }
  return out;
}
