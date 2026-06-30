import sys
import subprocess
import shutil

try:
    from PIL import Image
except ImportError:
    print("Pillow not found, installing...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

# The generated image path
src_image = r"C:\Users\thoma\.gemini\antigravity-cli\brain\fb2bacb0-fe6a-4311-bcd4-1a7bb67fe0da\servo_logo_v2_1782812117680.jpg"
dest_image = r"D:\Projects\Python\Servo\servo_logo.jpg"

print("Copying image to workspace...")
shutil.copy(src_image, dest_image)

print("Converting logo to transparent icon...")
img = Image.open(dest_image)
img = img.convert("RGBA")

# Make white background transparent
datas = img.getdata()
new_data = []
# Threshold for white
for item in datas:
    # If pixel is close to white, make it transparent
    if item[0] > 240 and item[1] > 240 and item[2] > 240:
        new_data.append((255, 255, 255, 0))
    else:
        new_data.append(item)

img.putdata(new_data)
img = img.resize((256, 256))
img.save("icon.ico", format="ICO", sizes=[(256, 256)])
print("Done! Transparent icon.ico created.")
