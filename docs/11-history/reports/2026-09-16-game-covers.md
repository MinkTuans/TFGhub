# Game card overlap and cover artwork — 2026-09-16

Status: validated; deployment pending.

The user's phone screenshot showed RS/NC fallback initials overlapping the lower-right “Xem trò chơi” action. Both occupied the same corner; the visual theme raised initials above the action. The action now occupies normal flow below artwork. Initials are smaller and centered; redundant branding is hidden on compact and narrow discovery thumbnails.

All 11 existing public games had no cover. Eleven different cover illustrations were generated using the built-in imagegen tool, inspected, and optimized to 1280×720 WebP. Each image is about 88–212 KB (1,753,684 bytes total). [Assets, prompts and source provenance](../../../assets/game-covers/2026-09-16/README.md); manifest records exact game mapping and hashes.

Validation:
- Original geometry overlap reproduced, then fixed.
- 18 focused component/unit tests; six actual-page browser cases at 320/390/1440 px × light/dark, covering home/discovery/compact related cards; typecheck and focused lint passed. Broader lint has only the pre-existing hierarchy-panel warning.
- Narrow 320px brand/initial collision found during review, reproduced and fixed.
- All eleven optimized images uploaded/read through the existing isolated API harness; exact content hashes and unchanged publication fields verified.
- Initial E2E attempt lacked browser path, then full harness rebuild hit startup timeout under load. Used installed Chrome with directly started compiled test API/Next; final cases passed. Initial upload harness request used IPv4 while harness listened on localhost/IPv6; corrected test URL, all uploads passed.
- Deployment script reviews addressed all-target version/hash preflight, bounded requests, isolated API image identity and health timeouts.

Rollout uses the existing owner-authorized image-upload API in an isolated API process while public services are stopped. Baseline checks cover all game content fields; only coverVersion/contentType/updatedAt may change. No source, publication, accounts, scores or play activity are modified. Successful cover uploads are individually valid and remain valid if web rollback is needed. Original public containers restart if the image-upload step fails; retries accept only matching version-1 bytes.

Rollout preflight discovered a newly created twelfth game, Chess (private draft), and aborted before any upload. Original API/web restarted healthy. The original eleven rows were unchanged; captured the additional row and generated a twelfth cover. Manifest now maps every ID explicitly; owned authenticated reads verify private cover bytes without publishing the draft. First backup: 20260916T164255-967626. Web build passed: sha256:988abf8174ea0448797d2e0e1721a96724b94ff7afcbf1b6b14bf333fdc6db11 (code a2f7498). Chess is uploaded through the API storage volume, so adding its source asset does not require rebuilding web.
