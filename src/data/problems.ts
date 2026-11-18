// The roadmap's built-in problem list, grouped by topic in this order.
// Each line is "number|title|difficulty|url" (E/M/H). Problems that aren't on
// LeetCode (implementations, classic algorithms) have no number, and usually no url.
// A problem may appear under more than one topic. Add your own in the app.
import type { Difficulty, Problem } from '../types';

const SEED: Record<string, string> = {
  Array: `1|Two Sum|E|https://leetcode.com/problems/two-sum/
167|Two Sum II - Input Array Is Sorted|M|https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/
26|Remove Duplicates from Sorted Array|E|https://leetcode.com/problems/remove-duplicates-from-sorted-array/
238|Product of Array Except Self|M|https://leetcode.com/problems/product-of-array-except-self/
11|Container With Most Water|M|https://leetcode.com/problems/container-with-most-water/
42|Trapping Rain Water|H|https://leetcode.com/problems/trapping-rain-water/
189|Rotate Array|M|https://leetcode.com/problems/rotate-array/
283|Move Zeroes|E|https://leetcode.com/problems/move-zeroes/
49|Group Anagrams|M|https://leetcode.com/problems/group-anagrams/
268|Missing Number|E|https://leetcode.com/problems/missing-number/
347|Top K Frequent Elements|M|https://leetcode.com/problems/top-k-frequent-elements/
75|Sort Colors|E|https://leetcode.com/problems/sort-colors/
54|Spiral Matrix|M|https://leetcode.com/problems/spiral-matrix/
169|Majority Element|E|https://leetcode.com/problems/majority-element/
229|Majority Element II|M|https://leetcode.com/problems/majority-element-ii/
128|Longest Consecutive Sequence|M|https://leetcode.com/problems/longest-consecutive-sequence/
14|Longest Common Prefix|E|https://leetcode.com/problems/longest-common-prefix/
3|Longest Substring Without Repeating Characters|M|https://leetcode.com/problems/longest-substring-without-repeating-characters/
53|Maximum Subarray|M|https://leetcode.com/problems/maximum-subarray/
151|Reverse Words in a String|M|https://leetcode.com/problems/reverse-words-in-a-string/
443|String Compression|M|https://leetcode.com/problems/string-compression/
392|Is Subsequence|E|https://leetcode.com/problems/is-subsequence/
1679|Max Number of K-Sum Pairs|M|https://leetcode.com/problems/max-number-of-k-sum-pairs/
15|3Sum|M|https://leetcode.com/problems/3sum/
567|Permutation in String|M|https://leetcode.com/problems/permutation-in-string/
155|Min Stack|M|https://leetcode.com/problems/min-stack/
239|Sliding Window Maximum|H|https://leetcode.com/problems/sliding-window-maximum/
76|Minimum Window Substring|H|https://leetcode.com/problems/minimum-window-substring/
739|Daily Temperatures|M|https://leetcode.com/problems/daily-temperatures/
853|Car Fleet|M|https://leetcode.com/problems/car-fleet/
84|Largest Rectangle in Histogram|H|https://leetcode.com/problems/largest-rectangle-in-histogram/
282|Expression Add Operators|H|https://leetcode.com/problems/expression-add-operators/`,
  'Linked List': `|Implementation|M
|Doubly Linked List|M
206|Reverse Linked List|E|https://leetcode.com/problems/reverse-linked-list/
21|Merge Two Sorted Lists|E|https://leetcode.com/problems/merge-two-sorted-lists/
143|Reorder List|M|https://leetcode.com/problems/reorder-list/
141|Linked List Cycle|E|https://leetcode.com/problems/linked-list-cycle/
142|Linked List Cycle II|M|https://leetcode.com/problems/linked-list-cycle-ii/
287|Find the Duplicate Number|M|https://leetcode.com/problems/find-the-duplicate-number/
146|LRU Cache|M|https://leetcode.com/problems/lru-cache/
83|Remove Duplicates from Sorted List|E|https://leetcode.com/problems/remove-duplicates-from-sorted-list/
160|Intersection of Two Linked Lists|E|https://leetcode.com/problems/intersection-of-two-linked-lists/
460|LFU Cache|H|https://leetcode.com/problems/lfu-cache/
1472|Design Browser History|M|https://leetcode.com/problems/design-browser-history/`,
  Sorting: `|All Sorting Algorithms|M`,
  Recursion: `78|Subsets|M|https://leetcode.com/problems/subsets/
|Subsets Sum No Duplicate Bags in Trolly|M
494|Target Sum|M|https://leetcode.com/problems/target-sum/
|Target Sum Only one answer Possible|M
39|Combination Sum - Infinite selection|M|https://leetcode.com/problems/combination-sum/
|Subset Sum with Infinite Selection and Only one answer|M
51|N-Queens|H|https://leetcode.com/problems/n-queens/
52|N-Queens II|H|https://leetcode.com/problems/n-queens-ii/
37|Sudoku Solver|H|https://leetcode.com/problems/sudoku-solver/
70|Climbing Stairs|E|https://leetcode.com/problems/climbing-stairs/
62|Unique Paths|M|https://leetcode.com/problems/unique-paths/
22|Generate Parentheses|M|https://leetcode.com/problems/generate-parentheses/
60|Permutation Sequence|H|https://leetcode.com/problems/permutation-sequence/`,
  Trees: `|BST IMP(DFS,BFS, Remove, Add)|M
102|Binary Tree Level Order Traversal|M|https://leetcode.com/problems/binary-tree-level-order-traversal/
144|Binary Tree Preorder Traversal|E|https://leetcode.com/problems/binary-tree-preorder-traversal/
450|Delete Node in a BST|M|https://leetcode.com/problems/delete-node-in-a-bst/
226|Invert Binary Tree|E|https://leetcode.com/problems/invert-binary-tree/
104|Maximum Depth of Binary Tree|E|https://leetcode.com/problems/maximum-depth-of-binary-tree/
543|Diameter of Binary Tree|E|https://leetcode.com/problems/diameter-of-binary-tree/
100|Same Tree|E|https://leetcode.com/problems/same-tree/
572|Subtree of Another Tree|E|https://leetcode.com/problems/subtree-of-another-tree/
235|Lowest Common Ancestor of a Binary Search Tree|M|https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/
236|Lowest Common Ancestor of a Binary Tree|M|https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/
103|Binary Tree Zigzag Level Order Traversal|M|https://leetcode.com/problems/binary-tree-zigzag-level-order-traversal/
|Top View of BTREE|M
987|Vertical Order Traversal of a Binary Tree|H|https://leetcode.com/problems/vertical-order-traversal-of-a-binary-tree/
|Full Binary Tree using Array|M
297|Serialize and Deserialize Binary Tree|H|https://leetcode.com/problems/serialize-and-deserialize-binary-tree/`,
  Heap: `|Implementation of Heap|M`,
  Graphs: `|Graph Facebook Implementation|M
|Graph Traversal|M
133|Clone Graph|M|https://leetcode.com/problems/clone-graph/
994|Rotting Oranges|M|https://leetcode.com/problems/rotting-oranges/
200|Number of Islands|M|https://leetcode.com/problems/number-of-islands/
733|Flood Fill|E|https://leetcode.com/problems/flood-fill/
|Number of Lakes|M
207|Course Schedule|M|https://leetcode.com/problems/course-schedule/
210|Course Schedule II|M|https://leetcode.com/problems/course-schedule-ii/
329|Longest Increasing Path in a Matrix|H|https://leetcode.com/problems/longest-increasing-path-in-a-matrix/
913|Cat and Mouse|H|https://leetcode.com/problems/cat-and-mouse/
|Djikstras Imp|H
743|Network Delay Time|M|https://leetcode.com/problems/network-delay-time/
|Bellman Impl|H
787|Cheapest Flights Within K Stops|M|https://leetcode.com/problems/cheapest-flights-within-k-stops/
|Topological Sort BFS ( Kahn's)|M
|Detect Cycle Directed BFS|M
|Topological Sort DFS|M
1462|Course Schedule IV|M|https://leetcode.com/problems/course-schedule-iv/
|Floyd Warshall|H
1334|Find the City With the Smallest Number of Neighbors at a Threshold Distance - Floyd Warshall Algorithm|M|https://leetcode.com/problems/find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance/
|Prims ( Minimum Spanning Tree)|H
1584|Min Cost to Connect All Points|M|https://leetcode.com/problems/min-cost-to-connect-all-points/
1091|Shortest Path in Binary Matrix|M|https://leetcode.com/problems/shortest-path-in-binary-matrix/
|Kruskals MST|H`,
  Tries: `208|Implement Trie (Prefix Tree)|M|https://leetcode.com/problems/implement-trie-prefix-tree/
|Search Suggestion|M
79|Word Search|M|https://leetcode.com/problems/word-search/
212|Word Search II|H|https://leetcode.com/problems/word-search-ii/`,
  'Dynamic Programming': `|FIB|E
70|Climbing Stairs|E|https://leetcode.com/problems/climbing-stairs/
62|Unique Paths|M|https://leetcode.com/problems/unique-paths/
63|Unique Paths II|M|https://leetcode.com/problems/unique-paths-ii/
|Target Sum Count|M
494|Target Sum Trolly|M|https://leetcode.com/problems/target-sum/
|Target Sum Possible Boolean based (unlimited supply)|M
|Get one combination which adds to target (unlimited supply)|M
|Get one combination which adds to target memo (unlimited supply)|M
|Get one combination which adds to target memo (limited supply)|M
198|House Robber|M|https://leetcode.com/problems/house-robber/
213|House Robber II|M|https://leetcode.com/problems/house-robber-ii/
64|Minimum Path Sum|M|https://leetcode.com/problems/minimum-path-sum/
|KnapSack01|M
322|Coin Change|M|https://leetcode.com/problems/coin-change/
121|Best Time to Buy and Sell Stock|E|https://leetcode.com/problems/best-time-to-buy-and-sell-stock/
122|Best Time to Buy and Sell Stock II|M|https://leetcode.com/problems/best-time-to-buy-and-sell-stock-ii/
123|Best Time to Buy and Sell Stock III|H|https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iii/
188|Best Time to Buy and Sell Stock IV|H|https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iv/
91|Decode Ways|M|https://leetcode.com/problems/decode-ways/
55|Jump Game|M|https://leetcode.com/problems/jump-game/
1143|Longest Common Subsequence|M|https://leetcode.com/problems/longest-common-subsequence/
516|Longest Palindromic Subsequence|M|https://leetcode.com/problems/longest-palindromic-subsequence/
5|Longest Palindromic Substring|M|https://leetcode.com/problems/longest-palindromic-substring/
|All subsequences Pattern(Sub problems approcah)|M
560|Subarray Sum Equals K|M|https://leetcode.com/problems/subarray-sum-equals-k/
|DP On strings|M`,
  Greedy: `|KnapSack Fractional|M
860|Lemonade Change|E|https://leetcode.com/problems/lemonade-change/
|N Meeting room|M|https://leetcode.com/problems/meeting-rooms-ii/`,
  'Binary Search': `34|Search Range|M|https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/
33|Search in Rotated Sorted Array|M|https://leetcode.com/problems/search-in-rotated-sorted-array/
875|Koko Eating Bananas|M|https://leetcode.com/problems/koko-eating-bananas/
69|Sqrt(x)|E|https://leetcode.com/problems/sqrtx/
1011|Capacity To Ship Packages Within D Days|M|https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/
74|Search a 2D Matrix|M|https://leetcode.com/problems/search-a-2d-matrix/
240|Search a 2D Matrix II|M|https://leetcode.com/problems/search-a-2d-matrix-ii/`,
  String: `|Rabin Karp|H
|KMP search|H`,
  'Bit Manipulation': `|Power Set|M`
};

const DIFF: Record<string, Difficulty> = { E: 'Easy', M: 'Medium', H: 'Hard' };

export const slugify = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');

export function seedProblems(): Problem[] {
  const out: Problem[] = [];
  const used = new Set<string>();
  for (const [topic, block] of Object.entries(SEED)) {
    for (const line of block.split('\n')) {
      const [num, title, d, url] = line.split('|');
      // A problem listed again under another topic gets its own entry (and its own code and notes).
      let id = num ? `lc-${num}` : `seed-${slugify(title)}`;
      if (used.has(id)) id = `${id}-${slugify(topic)}`;
      used.add(id);
      out.push({
        id,
        ...(num ? { number: Number(num), url: url || `https://leetcode.com/problems/${slugify(title)}/` } : url ? { url } : {}),
        title,
        difficulty: DIFF[d],
        topic,
        status: 'todo',
      });
    }
  }
  return out;
}
