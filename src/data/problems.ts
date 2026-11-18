// The roadmap's built-in problem list, grouped by topic in this order.
// Each line is "number|title|difficulty|url" (E/M/H). Problems that aren't on
// LeetCode (implementations, classic algorithms) have no number, and usually no url.
// A problem may appear under more than one topic. Add your own in the app.
//
// Lines starting with "+" are well-known problems and patterns added to fill
// gaps in the original 145-problem plan, placed where they fit the study
// order. The roadmap marks them so they stand out.
import type { Difficulty, Problem } from '../types';

const SEED: Record<string, string> = {
  Array: `1|Two Sum|E|https://leetcode.com/problems/two-sum/
167|Two Sum II - Input Array Is Sorted|M|https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/
+125|Valid Palindrome|E
+680|Valid Palindrome II|E|https://leetcode.com/problems/valid-palindrome-ii/
26|Remove Duplicates from Sorted Array|E|https://leetcode.com/problems/remove-duplicates-from-sorted-array/
+80|Remove Duplicates from Sorted Array II|M
+303|Range Sum Query - Immutable|E
+525|Contiguous Array|M|https://leetcode.com/problems/contiguous-array/
+523|Continuous Subarray Sum|M|https://leetcode.com/problems/continuous-subarray-sum/
+974|Subarray Sums Divisible by K|M|https://leetcode.com/problems/subarray-sums-divisible-by-k/
+930|Binary Subarrays With Sum|M|https://leetcode.com/problems/binary-subarrays-with-sum/
238|Product of Array Except Self|M|https://leetcode.com/problems/product-of-array-except-self/
11|Container With Most Water|M|https://leetcode.com/problems/container-with-most-water/
42|Trapping Rain Water|H|https://leetcode.com/problems/trapping-rain-water/
189|Rotate Array|M|https://leetcode.com/problems/rotate-array/
+670|Maximum Swap|M|https://leetcode.com/problems/maximum-swap/
+31|Next Permutation|M
283|Move Zeroes|E|https://leetcode.com/problems/move-zeroes/
+217|Contains Duplicate|E
+242|Valid Anagram|E
49|Group Anagrams|M|https://leetcode.com/problems/group-anagrams/
+249|Group Shifted Strings (Premium)|M|https://leetcode.com/problems/group-shifted-strings/
+271|Encode and Decode Strings (Premium)|M|https://leetcode.com/problems/encode-and-decode-strings/
268|Missing Number|E|https://leetcode.com/problems/missing-number/
+41|First Missing Positive|H
347|Top K Frequent Elements|M|https://leetcode.com/problems/top-k-frequent-elements/
75|Sort Colors|E|https://leetcode.com/problems/sort-colors/
54|Spiral Matrix|M|https://leetcode.com/problems/spiral-matrix/
+48|Rotate Image|M
+73|Set Matrix Zeroes|M
169|Majority Element|E|https://leetcode.com/problems/majority-element/
229|Majority Element II|M|https://leetcode.com/problems/majority-element-ii/
+274|H-Index|M
128|Longest Consecutive Sequence|M|https://leetcode.com/problems/longest-consecutive-sequence/
14|Longest Common Prefix|E|https://leetcode.com/problems/longest-common-prefix/
+643|Maximum Average Subarray I|E
3|Longest Substring Without Repeating Characters|M|https://leetcode.com/problems/longest-substring-without-repeating-characters/
+904|Fruit Into Baskets|M|https://leetcode.com/problems/fruit-into-baskets/
+438|Find All Anagrams in a String|M|https://leetcode.com/problems/find-all-anagrams-in-a-string/
+424|Longest Repeating Character Replacement|M
+1004|Max Consecutive Ones III|M
+209|Minimum Size Subarray Sum|M
+713|Subarray Product Less Than K|M|https://leetcode.com/problems/subarray-product-less-than-k/
+1838|Frequency of the Most Frequent Element|M|https://leetcode.com/problems/frequency-of-the-most-frequent-element/
+1423|Maximum Points You Can Obtain from Cards|M|https://leetcode.com/problems/maximum-points-you-can-obtain-from-cards/
+1658|Minimum Operations to Reduce X to Zero|M|https://leetcode.com/problems/minimum-operations-to-reduce-x-to-zero/
+2461|Maximum Sum of Distinct Subarrays With Length K|M|https://leetcode.com/problems/maximum-sum-of-distinct-subarrays-with-length-k/
+992|Subarrays with K Different Integers|H
53|Maximum Subarray|M|https://leetcode.com/problems/maximum-subarray/
+152|Maximum Product Subarray|M
+918|Maximum Sum Circular Subarray|M
151|Reverse Words in a String|M|https://leetcode.com/problems/reverse-words-in-a-string/
443|String Compression|M|https://leetcode.com/problems/string-compression/
392|Is Subsequence|E|https://leetcode.com/problems/is-subsequence/
1679|Max Number of K-Sum Pairs|M|https://leetcode.com/problems/max-number-of-k-sum-pairs/
15|3Sum|M|https://leetcode.com/problems/3sum/
+16|3Sum Closest|M|https://leetcode.com/problems/3sum-closest/
+881|Boats to Save People|M|https://leetcode.com/problems/boats-to-save-people/
+18|4Sum|M
567|Permutation in String|M|https://leetcode.com/problems/permutation-in-string/
+20|Valid Parentheses|E
+1249|Minimum Remove to Make Valid Parentheses|M|https://leetcode.com/problems/minimum-remove-to-make-valid-parentheses/
+921|Minimum Add to Make Parentheses Valid|M|https://leetcode.com/problems/minimum-add-to-make-parentheses-valid/
+1541|Minimum Insertions to Balance a Parentheses String|M|https://leetcode.com/problems/minimum-insertions-to-balance-a-parentheses-string/
+856|Score of Parentheses|M|https://leetcode.com/problems/score-of-parentheses/
+232|Implement Queue using Stacks|E
+225|Implement Stack using Queues|E
155|Min Stack|M|https://leetcode.com/problems/min-stack/
+150|Evaluate Reverse Polish Notation|M
+71|Simplify Path|M
+394|Decode String|M|https://leetcode.com/problems/decode-string/
+636|Exclusive Time of Functions|M|https://leetcode.com/problems/exclusive-time-of-functions/
+735|Asteroid Collision|M
+227|Basic Calculator II|M|https://leetcode.com/problems/basic-calculator-ii/
+224|Basic Calculator|H
239|Sliding Window Maximum|H|https://leetcode.com/problems/sliding-window-maximum/
+480|Sliding Window Median|H|https://leetcode.com/problems/sliding-window-median/
+862|Shortest Subarray with Sum at Least K|H
76|Minimum Window Substring|H|https://leetcode.com/problems/minimum-window-substring/
+30|Substring with Concatenation of All Words|H
+496|Next Greater Element I|E
+503|Next Greater Element II|M
739|Daily Temperatures|M|https://leetcode.com/problems/daily-temperatures/
+901|Online Stock Span|M
+1762|Buildings With an Ocean View (Premium)|M|https://leetcode.com/problems/buildings-with-an-ocean-view/
+1944|Number of Visible People in a Queue|H|https://leetcode.com/problems/number-of-visible-people-in-a-queue/
+907|Sum of Subarray Minimums|M
+402|Remove K Digits|M
+456|132 Pattern|M
853|Car Fleet|M|https://leetcode.com/problems/car-fleet/
84|Largest Rectangle in Histogram|H|https://leetcode.com/problems/largest-rectangle-in-histogram/
+85|Maximal Rectangle|H
282|Expression Add Operators|H|https://leetcode.com/problems/expression-add-operators/`,
  'Matrix & Simulation': `+36|Valid Sudoku|M
+289|Game of Life|M
+498|Diagonal Traverse|M|https://leetcode.com/problems/diagonal-traverse/
+835|Image Overlap|M|https://leetcode.com/problems/image-overlap/
+6|Zigzag Conversion|M
+8|String to Integer (atoi)|M
+65|Valid Number|H|https://leetcode.com/problems/valid-number/
+165|Compare Version Numbers|M|https://leetcode.com/problems/compare-version-numbers/
+38|Count and Say|M|https://leetcode.com/problems/count-and-say/
+68|Text Justification|H
+273|Integer to English Words|H|https://leetcode.com/problems/integer-to-english-words/`,
  'Linked List': `|Implementation|M
|Doubly Linked List|M
206|Reverse Linked List|E|https://leetcode.com/problems/reverse-linked-list/
+92|Reverse Linked List II|M
21|Merge Two Sorted Lists|E|https://leetcode.com/problems/merge-two-sorted-lists/
+876|Middle of the Linked List|E
143|Reorder List|M|https://leetcode.com/problems/reorder-list/
141|Linked List Cycle|E|https://leetcode.com/problems/linked-list-cycle/
142|Linked List Cycle II|M|https://leetcode.com/problems/linked-list-cycle-ii/
287|Find the Duplicate Number|M|https://leetcode.com/problems/find-the-duplicate-number/
+19|Remove Nth Node From End of List|M
+234|Palindrome Linked List|E
+2|Add Two Numbers|M
+61|Rotate List|M
+86|Partition List|M
146|LRU Cache|M|https://leetcode.com/problems/lru-cache/
83|Remove Duplicates from Sorted List|E|https://leetcode.com/problems/remove-duplicates-from-sorted-list/
+237|Delete Node in a Linked List|M|https://leetcode.com/problems/delete-node-in-a-linked-list/
+328|Odd Even Linked List|M|https://leetcode.com/problems/odd-even-linked-list/
+82|Remove Duplicates from Sorted List II|M
160|Intersection of Two Linked Lists|E|https://leetcode.com/problems/intersection-of-two-linked-lists/
460|LFU Cache|H|https://leetcode.com/problems/lfu-cache/
1472|Design Browser History|M|https://leetcode.com/problems/design-browser-history/
+138|Copy List with Random Pointer|M
+708|Insert into a Sorted Circular Linked List (Premium)|M|https://leetcode.com/problems/insert-into-a-sorted-circular-linked-list/
+25|Reverse Nodes in k-Group|H`,
  Sorting: `|All Sorting Algorithms|M
+88|Merge Sorted Array|E
+912|Sort an Array|M
+179|Largest Number|M|https://leetcode.com/problems/largest-number/
+791|Custom Sort String|M|https://leetcode.com/problems/custom-sort-string/
+148|Sort List|M
+493|Reverse Pairs|H
+164|Maximum Gap|M`,
  Intervals: `+252|Meeting Rooms (Premium)|E|https://leetcode.com/problems/meeting-rooms/
+56|Merge Intervals|M
+57|Insert Interval|M
+986|Interval List Intersections|M|https://leetcode.com/problems/interval-list-intersections/
+435|Non-overlapping Intervals|M
+452|Minimum Number of Arrows to Burst Balloons|M`,
  'Sweep Line & Difference Array': `+1109|Corporate Flight Bookings|M
+1094|Car Pooling|M|https://leetcode.com/problems/car-pooling/
+218|The Skyline Problem|H
+1851|Minimum Interval to Include Each Query|H
+3413|Maximum Coins From K Consecutive Bags|M|https://leetcode.com/problems/maximum-coins-from-k-consecutive-bags/`,
  Recursion: `78|Subsets|M|https://leetcode.com/problems/subsets/
+90|Subsets II|M
|Subsets Sum No Duplicate Bags in Trolly|M
494|Target Sum|M|https://leetcode.com/problems/target-sum/
|Target Sum Only one answer Possible|M
39|Combination Sum - Infinite selection|M|https://leetcode.com/problems/combination-sum/
+40|Combination Sum II|M
+216|Combination Sum III|M|https://leetcode.com/problems/combination-sum-iii/
+77|Combinations|M
|Subset Sum with Infinite Selection and Only one answer|M
+46|Permutations|M
+17|Letter Combinations of a Phone Number|M
+131|Palindrome Partitioning|M
+93|Restore IP Addresses|M
+301|Remove Invalid Parentheses|H
+339|Nested List Weight Sum (Premium)|M|https://leetcode.com/problems/nested-list-weight-sum/
+489|Robot Room Cleaner (Premium)|H|https://leetcode.com/problems/robot-room-cleaner/
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
+94|Binary Tree Inorder Traversal|E
+145|Binary Tree Postorder Traversal|E
450|Delete Node in a BST|M|https://leetcode.com/problems/delete-node-in-a-bst/
226|Invert Binary Tree|E|https://leetcode.com/problems/invert-binary-tree/
104|Maximum Depth of Binary Tree|E|https://leetcode.com/problems/maximum-depth-of-binary-tree/
+110|Balanced Binary Tree|E
+222|Count Complete Tree Nodes|E
+958|Check Completeness of a Binary Tree|M|https://leetcode.com/problems/check-completeness-of-a-binary-tree/
543|Diameter of Binary Tree|E|https://leetcode.com/problems/diameter-of-binary-tree/
100|Same Tree|E|https://leetcode.com/problems/same-tree/
572|Subtree of Another Tree|E|https://leetcode.com/problems/subtree-of-another-tree/
+112|Path Sum|E
+113|Path Sum II|M|https://leetcode.com/problems/path-sum-ii/
+437|Path Sum III|M|https://leetcode.com/problems/path-sum-iii/
+129|Sum Root to Leaf Numbers|M
+1448|Count Good Nodes in Binary Tree|M
+98|Validate Binary Search Tree|M
+108|Convert Sorted Array to Binary Search Tree|E
+230|Kth Smallest Element in a BST|M
+1038|Binary Search Tree to Greater Sum Tree|M|https://leetcode.com/problems/binary-search-tree-to-greater-sum-tree/
+173|Binary Search Tree Iterator|M
+99|Recover Binary Search Tree|M
+426|Convert Binary Search Tree to Sorted Doubly Linked List (Premium)|M|https://leetcode.com/problems/convert-binary-search-tree-to-sorted-doubly-linked-list/
235|Lowest Common Ancestor of a Binary Search Tree|M|https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/
236|Lowest Common Ancestor of a Binary Tree|M|https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree/
+1650|Lowest Common Ancestor of a Binary Tree III (Premium)|M|https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-tree-iii/
+863|All Nodes Distance K in Binary Tree|M
103|Binary Tree Zigzag Level Order Traversal|M|https://leetcode.com/problems/binary-tree-zigzag-level-order-traversal/
+199|Binary Tree Right Side View|M
+117|Populating Next Right Pointers in Each Node II|M
+662|Maximum Width of Binary Tree|M
|Top View of BTREE|M
987|Vertical Order Traversal of a Binary Tree|H|https://leetcode.com/problems/vertical-order-traversal-of-a-binary-tree/
+314|Binary Tree Vertical Order Traversal (Premium)|M|https://leetcode.com/problems/binary-tree-vertical-order-traversal/
|Full Binary Tree using Array|M
+105|Construct Binary Tree from Preorder and Inorder Traversal|M
+114|Flatten Binary Tree to Linked List|M
297|Serialize and Deserialize Binary Tree|H|https://leetcode.com/problems/serialize-and-deserialize-binary-tree/
+124|Binary Tree Maximum Path Sum|H
+1373|Maximum Sum BST in Binary Tree|H`,
  Heap: `|Implementation of Heap|M
+1046|Last Stone Weight|E
+703|Kth Largest Element in a Stream|E
+215|Kth Largest Element in an Array|M
+692|Top K Frequent Words|M|https://leetcode.com/problems/top-k-frequent-words/
+451|Sort Characters By Frequency|M|https://leetcode.com/problems/sort-characters-by-frequency/
+973|K Closest Points to Origin|M
+373|Find K Pairs with Smallest Sums|M
+23|Merge k Sorted Lists|H
+632|Smallest Range Covering Elements from K Lists|H
+621|Task Scheduler|M
+2402|Meeting Rooms III|H|https://leetcode.com/problems/meeting-rooms-iii/
+857|Minimum Cost to Hire K Workers|H|https://leetcode.com/problems/minimum-cost-to-hire-k-workers/
+767|Reorganize String|M
+295|Find Median from Data Stream|H
+502|IPO|H`,
  Design: `+706|Design HashMap|E
+622|Design Circular Queue|M
+380|Insert Delete GetRandom O(1)|M
+981|Time Based Key-Value Store|M
+355|Design Twitter|M
+382|Linked List Random Node|M
+398|Random Pick Index|M|https://leetcode.com/problems/random-pick-index/
+384|Shuffle an Array|M
+528|Random Pick with Weight|M
+1146|Snapshot Array|M
+362|Design Hit Counter (Premium)|M|https://leetcode.com/problems/design-hit-counter/
+348|Design Tic-Tac-Toe (Premium)|M|https://leetcode.com/problems/design-tic-tac-toe/
+284|Peeking Iterator|M|https://leetcode.com/problems/peeking-iterator/
+341|Flatten Nested List Iterator|M|https://leetcode.com/problems/flatten-nested-list-iterator/
+1570|Dot Product of Two Sparse Vectors (Premium)|M|https://leetcode.com/problems/dot-product-of-two-sparse-vectors/`,
  'Segment Tree & Fenwick Tree': `+|Segment Tree Implementation (with Lazy Propagation)|H
+307|Range Sum Query - Mutable|M
+|Fenwick Tree (Binary Indexed Tree) Implementation|M
+315|Count of Smaller Numbers After Self|H`,
  Graphs: `|Graph Facebook Implementation|M
|Graph Traversal|M
+1971|Find if Path Exists in Graph|E
133|Clone Graph|M|https://leetcode.com/problems/clone-graph/
994|Rotting Oranges|M|https://leetcode.com/problems/rotting-oranges/
+286|Walls and Gates (Premium)|M|https://leetcode.com/problems/walls-and-gates/
200|Number of Islands|M|https://leetcode.com/problems/number-of-islands/
+695|Max Area of Island|M
+827|Making A Large Island|H|https://leetcode.com/problems/making-a-large-island/
733|Flood Fill|E|https://leetcode.com/problems/flood-fill/
|Number of Lakes|M
+130|Surrounded Regions|M
+417|Pacific Atlantic Water Flow|M
+547|Number of Provinces|M
+261|Graph Valid Tree (Premium)|M|https://leetcode.com/problems/graph-valid-tree/
+323|Number of Connected Components in an Undirected Graph (Premium)|M|https://leetcode.com/problems/number-of-connected-components-in-an-undirected-graph/
+785|Is Graph Bipartite?|M
+399|Evaluate Division|M
207|Course Schedule|M|https://leetcode.com/problems/course-schedule/
210|Course Schedule II|M|https://leetcode.com/problems/course-schedule-ii/
329|Longest Increasing Path in a Matrix|H|https://leetcode.com/problems/longest-increasing-path-in-a-matrix/
913|Cat and Mouse|H|https://leetcode.com/problems/cat-and-mouse/
+127|Word Ladder|H
+433|Minimum Genetic Mutation|M
+909|Snakes and Ladders|M
+815|Bus Routes|H|https://leetcode.com/problems/bus-routes/
|Djikstras Imp|H
743|Network Delay Time|M|https://leetcode.com/problems/network-delay-time/
+1631|Path With Minimum Effort|M
+1976|Number of Ways to Arrive at Destination|M
+2812|Find the Safest Path in a Grid|M|https://leetcode.com/problems/find-the-safest-path-in-a-grid/
|Bellman Impl|H
787|Cheapest Flights Within K Stops|M|https://leetcode.com/problems/cheapest-flights-within-k-stops/
|Topological Sort BFS ( Kahn's)|M
|Detect Cycle Directed BFS|M
|Topological Sort DFS|M
+802|Find Eventual Safe States|M
+310|Minimum Height Trees|M
1462|Course Schedule IV|M|https://leetcode.com/problems/course-schedule-iv/
+269|Alien Dictionary (Premium)|H|https://leetcode.com/problems/alien-dictionary/
|Floyd Warshall|H
1334|Find the City With the Smallest Number of Neighbors at a Threshold Distance - Floyd Warshall Algorithm|M|https://leetcode.com/problems/find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance/
|Prims ( Minimum Spanning Tree)|H
1584|Min Cost to Connect All Points|M|https://leetcode.com/problems/min-cost-to-connect-all-points/
1091|Shortest Path in Binary Matrix|M|https://leetcode.com/problems/shortest-path-in-binary-matrix/
+|Union Find (Disjoint Set) Implementation|M
|Kruskals MST|H
+684|Redundant Connection|M
+721|Accounts Merge|M
+947|Most Stones Removed with Same Row or Column|M
+1319|Number of Operations to Make Network Connected|M
+990|Satisfiability of Equality Equations|M|https://leetcode.com/problems/satisfiability-of-equality-equations/`,
  'Advanced Graphs': `+778|Swim in Rising Water|H
+1368|Minimum Cost to Make at Least One Valid Path in a Grid|H
+847|Shortest Path Visiting All Nodes|H
+332|Reconstruct Itinerary|H
+|Kosaraju's Algorithm (Strongly Connected Components)|H
+1192|Critical Connections in a Network|H
+1489|Find Critical and Pseudo-Critical Edges in Minimum Spanning Tree|H
+1483|Kth Ancestor of a Tree Node|H
+2858|Minimum Edge Reversals So Every Node Is Reachable|H|https://leetcode.com/problems/minimum-edge-reversals-so-every-node-is-reachable/`,
  Tries: `208|Implement Trie (Prefix Tree)|M|https://leetcode.com/problems/implement-trie-prefix-tree/
+211|Design Add and Search Words Data Structure|M
|Search Suggestion|M
79|Word Search|M|https://leetcode.com/problems/word-search/
212|Word Search II|H|https://leetcode.com/problems/word-search-ii/
+421|Maximum XOR of Two Numbers in an Array|M
+472|Concatenated Words|H
+336|Palindrome Pairs|H`,
  'Dynamic Programming': `|FIB|E
70|Climbing Stairs|E|https://leetcode.com/problems/climbing-stairs/
+746|Min Cost Climbing Stairs|E
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
+740|Delete and Earn|M|https://leetcode.com/problems/delete-and-earn/
64|Minimum Path Sum|M|https://leetcode.com/problems/minimum-path-sum/
+120|Triangle|M
+221|Maximal Square|M
+174|Dungeon Game|H
+741|Cherry Pickup|H
+1463|Cherry Pickup II|H|https://leetcode.com/problems/cherry-pickup-ii/
|KnapSack01|M
+416|Partition Equal Subset Sum|M
+1049|Last Stone Weight II|M|https://leetcode.com/problems/last-stone-weight-ii/
+474|Ones and Zeroes|M|https://leetcode.com/problems/ones-and-zeroes/
322|Coin Change|M|https://leetcode.com/problems/coin-change/
+518|Coin Change II|M
+377|Combination Sum IV|M
+279|Perfect Squares|M
121|Best Time to Buy and Sell Stock|E|https://leetcode.com/problems/best-time-to-buy-and-sell-stock/
122|Best Time to Buy and Sell Stock II|M|https://leetcode.com/problems/best-time-to-buy-and-sell-stock-ii/
123|Best Time to Buy and Sell Stock III|H|https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iii/
188|Best Time to Buy and Sell Stock IV|H|https://leetcode.com/problems/best-time-to-buy-and-sell-stock-iv/
+309|Best Time to Buy and Sell Stock with Cooldown|M
+714|Best Time to Buy and Sell Stock with Transaction Fee|M|https://leetcode.com/problems/best-time-to-buy-and-sell-stock-with-transaction-fee/
91|Decode Ways|M|https://leetcode.com/problems/decode-ways/
55|Jump Game|M|https://leetcode.com/problems/jump-game/
+45|Jump Game II|M
+300|Longest Increasing Subsequence|M
+673|Number of Longest Increasing Subsequence|M
+368|Largest Divisible Subset|M
+1048|Longest String Chain|M
1143|Longest Common Subsequence|M|https://leetcode.com/problems/longest-common-subsequence/
+583|Delete Operation for Two Strings|M
+1092|Shortest Common Supersequence|H
+97|Interleaving String|M
+115|Distinct Subsequences|H
+940|Distinct Subsequences II|H|https://leetcode.com/problems/distinct-subsequences-ii/
516|Longest Palindromic Subsequence|M|https://leetcode.com/problems/longest-palindromic-subsequence/
+1216|Valid Palindrome III (Premium)|H|https://leetcode.com/problems/valid-palindrome-iii/
5|Longest Palindromic Substring|M|https://leetcode.com/problems/longest-palindromic-substring/
+647|Palindromic Substrings|M
+132|Palindrome Partitioning II|H
+1043|Partition Array for Maximum Sum|M
+1335|Minimum Difficulty of a Job Schedule|H|https://leetcode.com/problems/minimum-difficulty-of-a-job-schedule/
|All subsequences Pattern(Sub problems approcah)|M
560|Subarray Sum Equals K|M|https://leetcode.com/problems/subarray-sum-equals-k/
|DP On strings|M
+72|Edit Distance|M
+44|Wildcard Matching|H
+139|Word Break|M
+312|Burst Balloons|H
+1547|Minimum Cost to Cut a Stick|H
+32|Longest Valid Parentheses|H`,
  'Advanced DP': `+337|House Robber III|M
+968|Binary Tree Cameras|H
+698|Partition to K Equal Sum Subsets|M
+1039|Minimum Score Triangulation of Polygon|M
+1478|Allocate Mailboxes|H|https://leetcode.com/problems/allocate-mailboxes/
+486|Predict the Winner|M
+877|Stone Game|M|https://leetcode.com/problems/stone-game/
+1140|Stone Game II|M|https://leetcode.com/problems/stone-game-ii/
+354|Russian Doll Envelopes|H
+1235|Maximum Profit in Job Scheduling|H
+10|Regular Expression Matching|H
+233|Number of Digit One|H`,
  Greedy: `|KnapSack Fractional|M
860|Lemonade Change|E|https://leetcode.com/problems/lemonade-change/
|N Meeting room|M|https://leetcode.com/problems/meeting-rooms-ii/
+134|Gas Station|M
+763|Partition Labels|M
+846|Hand of Straights|M
+1899|Merge Triplets to Form Target Triplet|M
+678|Valid Parenthesis String|M
+135|Candy|H`,
  'Binary Search': `+704|Binary Search|E
+35|Search Insert Position|E
34|Search Range|M|https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/
+153|Find Minimum in Rotated Sorted Array|M
33|Search in Rotated Sorted Array|M|https://leetcode.com/problems/search-in-rotated-sorted-array/
+81|Search in Rotated Sorted Array II|M
+162|Find Peak Element|M
+658|Find K Closest Elements|M|https://leetcode.com/problems/find-k-closest-elements/
+540|Single Element in a Sorted Array|M
875|Koko Eating Bananas|M|https://leetcode.com/problems/koko-eating-bananas/
+1482|Minimum Number of Days to Make m Bouquets|M
69|Sqrt(x)|E|https://leetcode.com/problems/sqrtx/
+1539|Kth Missing Positive Number|E
1011|Capacity To Ship Packages Within D Days|M|https://leetcode.com/problems/capacity-to-ship-packages-within-d-days/
+410|Split Array Largest Sum|H
74|Search a 2D Matrix|M|https://leetcode.com/problems/search-a-2d-matrix/
240|Search a 2D Matrix II|M|https://leetcode.com/problems/search-a-2d-matrix-ii/
+378|Kth Smallest Element in a Sorted Matrix|M
+4|Median of Two Sorted Arrays|H`,
  String: `+28|Find the Index of the First Occurrence in a String|E
|Rabin Karp|H
+187|Repeated DNA Sequences|M|https://leetcode.com/problems/repeated-dna-sequences/
|KMP search|H
+|Z-Algorithm|H
+214|Shortest Palindrome|H
+|Manacher's Algorithm|H
+1044|Longest Duplicate Substring|H`,
  'Bit Manipulation': `+136|Single Number|E
+137|Single Number II|M
+260|Single Number III|M
+191|Number of 1 Bits|E
+338|Counting Bits|E
|Power Set|M
+190|Reverse Bits|E
+371|Sum of Two Integers|M
+201|Bitwise AND of Numbers Range|M
+29|Divide Two Integers|M`,
  'Math & Number Theory': `+|GCD and LCM (Euclid's Algorithm)|E
+204|Count Primes|M
+50|Pow(x, n)|M
+|Matrix Exponentiation (Fibonacci in O(log n))|M
+1922|Count Good Numbers|M
+|nCr mod p (Pascal's Triangle, Fermat's Little Theorem)|M
+43|Multiply Strings|M
+7|Reverse Integer|M
+12|Integer to Roman|M
+172|Factorial Trailing Zeroes|M
+202|Happy Number|E`,
  Geometry: `+2013|Detect Squares|M
+149|Max Points on a Line|H
+587|Erect the Fence|H`
};

const DIFF: Record<string, Difficulty> = { E: 'Easy', M: 'Medium', H: 'Hard' };

export const slugify = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');

export function seedProblems(): Problem[] {
  const out: Problem[] = [];
  const used = new Set<string>();
  for (const [topic, block] of Object.entries(SEED)) {
    for (const line of block.split('\n')) {
      const added = line.startsWith('+');
      const [num, title, d, url] = (added ? line.slice(1) : line).split('|');
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
        ...(added ? { added: true } : {}),
      });
    }
  }
  return out;
}
