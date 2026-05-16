try:
    import torch
    import torch.nn as nn
    _TORCH_AVAILABLE = True
except ImportError:
    _TORCH_AVAILABLE = False
    torch = None  # type: ignore
    nn = None     # type: ignore


class StockLSTM:
    """
    Stacked bidirectional LSTM for sequence-to-one directional prediction.
    Requires torch. If torch is not installed, instantiation raises ImportError.
    """
    def __new__(cls, *args, **kwargs):
        if not _TORCH_AVAILABLE:
            raise ImportError("PyTorch is not installed. StockLSTM requires torch.")
        return _StockLSTMImpl(*args, **kwargs)


if _TORCH_AVAILABLE:
    class _StockLSTMImpl(nn.Module):
        def __init__(self, input_size=47, hidden_size1=256, hidden_size2=128, num_classes=3):
            super().__init__()
            self.lstm1 = nn.LSTM(input_size, hidden_size1, batch_first=True, bidirectional=True, dropout=0.2, num_layers=1)
            self.lstm2 = nn.LSTM(hidden_size1 * 2, hidden_size2, batch_first=True, bidirectional=True, dropout=0.2, num_layers=1)
            self.attn = nn.MultiheadAttention(embed_dim=hidden_size2 * 2, num_heads=4, batch_first=True)
            self.fc1 = nn.Linear(hidden_size2 * 2, 128)
            self.ln1 = nn.LayerNorm(128)
            self.relu = nn.ReLU()
            self.dropout = nn.Dropout(0.3)
            self.fc2 = nn.Linear(128, 64)
            self.out = nn.Linear(64, num_classes)

        def forward(self, x):
            out, _ = self.lstm1(x)
            out, _ = self.lstm2(out)
            attn_out, _ = self.attn(out, out, out)
            context = attn_out[:, -1, :]
            x = self.fc1(context)
            x = self.ln1(x)
            x = self.relu(x)
            x = self.dropout(x)
            x = self.fc2(x)
            x = self.relu(x)
            logits = self.out(x)
            return logits
else:
    class _StockLSTMImpl:  # type: ignore
        pass
