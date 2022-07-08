# full res -> reduced
for f in *.*; do echo "$f"; convert "$f" -resize 20% -quality 70 -strip -auto-orient resize/"$f"; done

# partial res -> reduced
for f in *.*; do echo "$f"; convert "$f" -resize 50% -quality 90 -strip -auto-orient resize/"$f"; done

# run chrome to allow CORS, external scripts (MacOS)
open -n -a /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --args --user-data-dir="/tmp/chrome_dev_test" --disable-web-security