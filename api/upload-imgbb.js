const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const formData = new URLSearchParams();
    formData.append("image", req.body.image);
    const apiRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: "POST", body: formData
    });
    const data = await apiRes.json();
    if (data.success) return res.status(200).json({ url: data.data.display_url });
    throw new Error("ImgBB failed");
  } catch (err) { return res.status(500).json({ error: err.message }); }
};
