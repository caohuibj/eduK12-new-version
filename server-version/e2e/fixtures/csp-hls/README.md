# CSP playback fixture

Synthetic one-second blue 160×90 H.264 video, no audio or user data. The CSP
browser probe still plays this MPEG-TS segment through Hls.js under the enforced
production policy. FFmpeg was only generating this fixed input on every CI run;
it is not a browser or recording prerequisite for this probe.

Generated with the probe's original command:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=blue:s=160x90:r=25 -t 1 -an -c:v libx264 -pix_fmt yuv420p -f hls -hls_time 1 -hls_list_size 0 probe.m3u8
mv probe0.ts probe0.mpegts
```

The server retains `/compat/probe0.ts` with `video/mp2t` as the playlist URL.
The stored `.mpegts` extension avoids treating binary media as TypeScript source.
